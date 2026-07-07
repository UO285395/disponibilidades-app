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

export const userAPI = {
  me() {
    return request("/me");
  }
};

export const deviceAPI = {
  registerToken(token, platform = "android", deviceId = null) {
    return request("/device-tokens/register", "POST", {
      token,
      platform,
      device_id: deviceId,
    });
  },
};

// ------------------- EVENTS (usuario) -------------------

export const eventsAPI = {
  list() {
    return request("/events");
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
  }
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
