import { Capacitor } from "@capacitor/core";

const API_URL = "https://backend-disponibilidad-production.up.railway.app";
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

export async function setToken(token) {
  cachedToken = token;
  localStorage.setItem(TOKEN_KEY, token);

  const Preferences = await getPreferences();
  if (Preferences) {
    await Preferences.set({ key: TOKEN_KEY, value: token });
  }

  emitAuthChange();
}

export async function clearToken() {
  cachedToken = null;
  localStorage.removeItem(TOKEN_KEY);

  try {
    const Preferences = await getPreferences();
    if (Preferences) {
      await Preferences.remove({ key: TOKEN_KEY });
    }
  } catch {
    // Best-effort: la sesion local ya quedo limpia aunque falle el storage nativo.
  }

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

  const res = await fetch(API_URL + endpoint, opts);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} - ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
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

  async register(email, fullName, password) {
    return request("/register", "POST", {
      email,
      full_name: fullName,
      password
    });
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

export const userAPI = {
  me() {
    return request("/me");
  }
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
};

// ------------------- CALENDARIO (export iCalendar) -------------------

async function downloadIcsFromEndpoint(endpoint, filename) {
  const opts = { method: "GET", headers: {} };
  const token = getToken();
  if (token) opts.headers["Authorization"] = "Bearer " + token;

  const res = await fetch(`${API_URL}${endpoint}`, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} - ${text}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
