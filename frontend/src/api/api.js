import { Capacitor } from "@capacitor/core";

// En producción se configura VITE_API_URL en las variables de entorno del
// hosting (Render, Netlify, Vercel…). Si no se define, se usa la URL de Railway
// para que la instalación original siga funcionando sin cambios.
const API_URL = import.meta.env.VITE_API_URL || "https://backend-disponibilidad-production.up.railway.app";
const AUTH_CHANGE_EVENT = "auth-changed";

const TOKEN_KEY = "token";
let cachedToken = null;
try {
  cachedToken = localStorage.getItem(TOKEN_KEY);
} catch {
  cachedToken = null;
}
let preferencesPromise = null;

function emitAuthChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: { hasSession: Boolean(cachedToken) } }));
}

export function subscribeAuthChanges(callback) {
  if (typeof window === "undefined") return () => {};

  const handler = (event) => {
    callback(Boolean(event?.detail?.hasSession));
  };

  window.addEventListener(AUTH_CHANGE_EVENT, handler);
  return () => window.removeEventListener(AUTH_CHANGE_EVENT, handler);
}

async function getPreferences() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!preferencesPromise) {
    preferencesPromise = import("@capacitor/preferences")
      .then((m) => m.Preferences)
      .catch(() => null);
  }
  return preferencesPromise;
}

export async function initializeAuthStorage() {
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  try {
    const init = (async () => {
      const Preferences = await getPreferences();
      if (!Preferences) {
        cachedToken = localStorage.getItem(TOKEN_KEY);
        return;
      }
      const stored = await Preferences.get({ key: TOKEN_KEY });
      if (stored?.value) {
        cachedToken = stored.value;
        localStorage.setItem(TOKEN_KEY, stored.value);
      } else {
        cachedToken = localStorage.getItem(TOKEN_KEY);
      }
    })();

    await Promise.race([init, timeout]);
  } catch (error) {
    console.error("No se pudo inicializar almacenamiento de sesion", error);
  } finally {
    // Fallback siempre: si cachedToken sigue null, intentar localStorage
    if (!cachedToken) {
      try {
        cachedToken = localStorage.getItem(TOKEN_KEY);
      } catch {
        cachedToken = null;
      }
    }
  }
}

// ------------------- TOKEN STORAGE -------------------

export function getToken() {
  if (cachedToken) return cachedToken;
  cachedToken = localStorage.getItem(TOKEN_KEY);
  return cachedToken;
}

// Persistencia nativa best-effort y NO bloqueante. En algunos dispositivos el
// puente de Capacitor Preferences puede quedarse colgado; el token ya está en
// cache + localStorage, así que la sesión funciona igual. Antes, setToken hacía
// `await Preferences.set(...)` sin protección y el login se quedaba congelado
// (el spinner no terminaba nunca). initializeAuthStorage ya evitaba esto con un
// timeout; aquí lo evitamos no esperando a la escritura nativa.
function persistTokenToPreferences(token) {
  getPreferences()
    .then((Preferences) => {
      if (!Preferences) return null;
      return token === null
        ? Preferences.remove({ key: TOKEN_KEY })
        : Preferences.set({ key: TOKEN_KEY, value: token });
    })
    .catch(() => {
      // La sesión local (cache + localStorage) ya quedó consistente.
    });
}

export function setToken(token) {
  cachedToken = token;
  localStorage.setItem(TOKEN_KEY, token);
  persistTokenToPreferences(token);
  emitAuthChange();
}

export function clearToken() {
  cachedToken = null;
  localStorage.removeItem(TOKEN_KEY);
  persistTokenToPreferences(null);
  emitAuthChange();
}

// ------------------- IDENTIDAD DE INVITADO -------------------
// UUID persistente en localStorage para deduplicar respuestas de visitantes
// sin cuenta. Mucho más fiable que el fallback IP+nombre+email del backend.
const GUEST_ID_KEY = "guest_identifier";

export function getOrCreateGuestId() {
  try {
    let guestId = localStorage.getItem(GUEST_ID_KEY);
    if (!guestId) {
      guestId = crypto.randomUUID();
      localStorage.setItem(GUEST_ID_KEY, guestId);
    }
    return guestId;
  } catch {
    return crypto.randomUUID();
  }
}

// ------------------- REQUEST WRAPPER -------------------

// ------------------- CACHÉ DE LECTURA (offline) -------------------
// Guarda la última respuesta correcta de cada GET para poder mostrar contenido
// al instante si la red falla o va lenta. Solo se usa como respaldo ante un
// error de red (fetch lanza), nunca ante un error HTTP explícito del servidor.
const READ_CACHE_PREFIX = "read_cache:";

function readCacheKey(endpoint) {
  return READ_CACHE_PREFIX + endpoint;
}

function saveReadCache(endpoint, data) {
  try {
    localStorage.setItem(readCacheKey(endpoint), JSON.stringify({ t: Date.now(), data }));
  } catch {
    // Cuota llena o no disponible: la caché es best-effort.
  }
}

function loadReadCache(endpoint) {
  try {
    const raw = localStorage.getItem(readCacheKey(endpoint));
    if (!raw) return undefined;
    return JSON.parse(raw).data;
  } catch {
    return undefined;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function request(endpoint, method = "GET", body = null, includeAuth = true) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json"
    }
  };

  const token = getToken();
  if (includeAuth && token) {
    opts.headers["Authorization"] = "Bearer " + token;
  }

  if (body) {
    opts.body = JSON.stringify(body);
  }

  const isGet = method === "GET";
  // Reintentos con backoff solo para fallos transitorios (red caída o 5xx).
  // Los GET se reintentan; las mutaciones no, para no duplicar efectos.
  const maxAttempts = isGet ? 3 : 1;
  let lastNetworkError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res;
    try {
      res = await fetch(API_URL + endpoint, opts);
    } catch (networkError) {
      lastNetworkError = networkError;
      if (attempt < maxAttempts - 1) {
        await sleep(300 * 2 ** attempt); // 300ms, 600ms
        continue;
      }
      break;
    }

    if (res.status >= 500 && attempt < maxAttempts - 1) {
      await sleep(300 * 2 ** attempt);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} - ${text}`);
    }

    if (res.status === 204) return null;
    const data = await res.json();
    if (isGet) saveReadCache(endpoint, data);
    return data;
  }

  // La red falló en todos los intentos: si es un GET con caché, devolvemos la
  // última copia conocida para que la app siga siendo usable sin conexión.
  if (isGet) {
    const cached = loadReadCache(endpoint);
    if (cached !== undefined) return cached;
  }
  throw lastNetworkError || new Error("No se pudo conectar con el servidor");
}

// ------------------- AUTH -------------------

export const authAPI = {
  async login(email, password) {
    const data = await request("/login", "POST", { email, password });
    await setToken(data.access_token);
    return data;
  },

  async refresh() {
    const data = await request("/auth/refresh", "POST");
    await setToken(data.access_token);
    return data;
  },

  changePassword(currentPassword, newPassword, confirmNewPassword) {
    return request("/auth/change-password", "PUT", {
      current_password: currentPassword,
      new_password: newPassword,
      confirm_new_password: confirmNewPassword
    });
  }
};

// Decodifica el JWT actual y, si le quedan menos de 24h de vida, lo refresca
// en segundo plano contra /auth/refresh. Devuelve false solo si no hay token,
// el token es ilegible, ya expiró, o el refresco falló (sesión realmente muerta).
export async function ensureTokenValid() {
  const token = getToken();
  if (!token) return false;

  let payload;
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    payload = JSON.parse(atob(base64));
  } catch {
    return false;
  }

  if (!payload?.exp) return true;

  const msUntilExpiry = payload.exp * 1000 - Date.now();
  if (msUntilExpiry <= 0) return false;

  const hoursUntilExpiry = msUntilExpiry / (1000 * 60 * 60);
  if (hoursUntilExpiry < 24) {
    try {
      await authAPI.refresh();
    } catch {
      return false;
    }
  }

  return true;
}

// URL de compartición con metadatos Open Graph (el backend sirve /e/{id} con
// las etiquetas para que WhatsApp/redes muestren título y descripción).
export function getShareUrl(eventId) {
  return `${API_URL}/e/${eventId}`;
}

export const userAPI = {
  me() {
    return request("/me");
  },

  getReminderPrefs() {
    return request("/me/reminder-prefs");
  },

  updateReminderPrefs(prefs) {
    return request("/me/reminder-prefs", "PUT", prefs);
  },
};

export const deviceAPI = {
  registerToken(token, platform = "android", deviceId = null, userRole = null) {
    return request("/device-tokens/register", "POST", {
      token,
      platform,
      device_id: deviceId,
      user_role: userRole || undefined,
    });
  },
};

// ------------------- EVENTS (usuario) -------------------

export const eventsAPI = {
  list(visibility = null) {
    const qs = visibility ? `?visibility=${encodeURIComponent(visibility)}` : "";
    return request(`/events${qs}`);
  },

  respond(event_id, answer, justification) {
    return request(`/events/${event_id}/responses`, "POST", {
      answer,
      justification
    });
  },

  myResponses() {
    return request("/my-event-responses");
  },

  myCompanions() {
    return request("/my-event-companions");
  },

  updateMyCompanions(event_id, count) {
    return request(`/events/${event_id}/companions/my`, "PUT", { count });
  },

  // Recordatorios de evento (opt-in del usuario).
  myReminders() {
    return request("/my-event-reminders");
  },

  setReminder(event_id, minutesBefore, channels = ["push"]) {
    return request(`/events/${event_id}/reminder`, "PUT", {
      minutes_before: minutesBefore,
      channels,
    });
  },

  deleteReminder(event_id) {
    return request(`/events/${event_id}/reminder`, "DELETE");
  },

  // ------------------- PÚBLICO / INVITADOS -------------------

  listPublic(provinceId = null) {
    const qs = provinceId ? `&province_id=${provinceId}` : "";
    return request(`/events?visibility=public${qs}`, "GET", null, false);
  },

  listProvinces() {
    return request("/geo/provinces", "GET", null, false);
  },

  getPublicDetail(event_id) {
    return request(`/events/${event_id}/public`, "GET", null, false);
  },

  respondGuest(event_id, { guestName, answer, companions }) {
    return request(`/events/${event_id}/responses/guest`, "POST", {
      guest_name: guestName || null,
      answer,
      companions: companions || 0,
      guest_identifier: getOrCreateGuestId(),
    }, false);
  },

  // ------------------- DISPONIBILIDAD POR EVENTO -------------------

  getMyEventAvailability(event_id) {
    return request(`/events/${event_id}/availability/my`);
  },

  createMyEventAvailability(event_id, hour) {
    return request(`/events/${event_id}/availability/my`, "POST", { hour });
  },

  deleteMyEventAvailability(event_id, slot_id) {
    return request(`/events/${event_id}/availability/my/${slot_id}`, "DELETE");
  },

  getGuestEventAvailability(event_id) {
    const qs = `?guest_identifier=${encodeURIComponent(getOrCreateGuestId())}`;
    return request(`/events/${event_id}/availability/guest${qs}`, "GET", null, false);
  },

  createGuestEventAvailability(event_id, hour, guestName) {
    return request(`/events/${event_id}/availability/guest`, "POST", {
      hour,
      guest_name: guestName || null,
      guest_identifier: getOrCreateGuestId(),
    }, false);
  },

  deleteGuestEventAvailability(event_id, slot_id) {
    return request(`/events/${event_id}/availability/guest/${slot_id}`, "DELETE", {
      guest_identifier: getOrCreateGuestId(),
    }, false);
  },
};

// ------------------- CALENDARIO (export iCalendar) -------------------

// En web se descarga el .ics con el truco del <a download>. En la APK ESO NO
// FUNCIONA: el WebView de Android no tiene gestor de descargas, así que al
// pulsar no pasaba nada. En nativo se escribe el .ics a un archivo y se abre la
// hoja de compartir del sistema, desde la que el usuario lo añade a su
// calendario (Google Calendar, Samsung, Outlook... todos importan .ics).
async function shareIcsNative(icsText, filename) {
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");

  await Filesystem.writeFile({
    path: filename,
    data: icsText,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });

  await Share.share({
    title: "Añadir a calendario",
    files: [uri],
  });
}

function downloadIcsWeb(icsText, filename) {
  const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadIcsFromEndpoint(endpoint, filename) {
  const opts = { method: "GET", headers: {} };
  const token = getToken();
  if (token) opts.headers["Authorization"] = "Bearer " + token;

  const res = await fetch(`${API_URL}${endpoint}`, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} - ${text}`);
  }

  const icsText = await res.text();

  if (Capacitor.isNativePlatform()) {
    await shareIcsNative(icsText, filename);
  } else {
    downloadIcsWeb(icsText, filename);
  }
}

export const calendarAPI = {
  download(visibility = null, provinceId = null) {
    const params = [];
    if (visibility) params.push(`visibility=${encodeURIComponent(visibility)}`);
    if (provinceId) params.push(`province_id=${provinceId}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return downloadIcsFromEndpoint(`/calendar/export.ics${qs}`, "eventos.ics");
  },

  downloadEvent(eventId) {
    return downloadIcsFromEndpoint(`/events/${eventId}/calendar.ics`, `evento-${eventId}.ics`);
  },
};


// ------------------- ESPACIOS (usuario) -------------------

export const spacesAPI = {
  list() {
    return request("/spaces");
  }
};

// ------------------- RESERVATIONS (usuario) -------------------

export const reservationsAPI = {
  list() {
    return request("/reservations");
  },

  create(space_id, date, start_time, end_time, reason) {
    return request("/reservations", "POST", {
      space_id,
      date,
      start_time,
      end_time,
      reason,
    });
  },

  delete(id) {
    return request(`/reservations/${id}`, "DELETE");
  },
};

// ------------------- AVAILABILITY (usuario) -------------------

export const availabilityAPI = {
  listMine() {
    return request("/availability/my");
  },

  create(date, start_time, end_time) {
    return request("/availability/my", "POST", {
      date,
      start_time,
      end_time
    });
  },

  delete(id) {
    return request(`/availability/my/${id}`, "DELETE");
  }
};
