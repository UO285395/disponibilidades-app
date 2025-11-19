import { request } from "./api.js";

export const adminAPI = {
  listUsers() {
    return request("/admin/users");
  },

  // endpoint secreto para ti
  becomeAdmin() {
    return request("/admin/become_admin", "POST");
  },

  makeAdmin(userId) {
    return request(`/admin/make_admin/${userId}`, "POST");
  },

  removeAdmin(userId) {
    return request(`/admin/remove_admin/${userId}`, "POST");
  },

  // Eventos
  listEvents() {
    return request("/events");
  },

  createEvent(payload) {
    return request("/events", "POST", payload);
  },

  deleteEvent(id) {
    return request(`/admin/events/${id}`, "DELETE");
  },

  getEventResponses(eventId) {
    return request(`/events/${eventId}/responses`);
  },

  // Disponibilidades de todos
  listAvailabilities() {
    return request("/admin/availability");
  }
};
