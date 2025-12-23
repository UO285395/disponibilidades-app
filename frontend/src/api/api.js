const API_URL = "https://backend-disponibilidad-production.up.railway.app";

// ------------------- TOKEN STORAGE -------------------

export function getToken() {
  return localStorage.getItem("token");
}

export function setToken(token) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
}

// ------------------- REQUEST WRAPPER -------------------

export async function request(endpoint, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json"
    }
  };

  const token = getToken();
  if (token) {
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
    setToken(data.access_token);
    return data;
  }
};

export const userAPI = {
  me() {
    return request("/me");
  }
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
    return request("/events/my-responses");
  }
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
