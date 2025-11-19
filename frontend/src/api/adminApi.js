import { request } from "./api.js";
export const adminAPI = {
  listUsers() {
    return request("/admin/users");
  },

  makeAdmin(userId) {
    return request(`/admin/make_admin/${userId}`, "POST");
  },

  removeAdmin(userId) {
    return request(`/admin/remove_admin/${userId}`, "POST");
  },

  createEvent(data) {
    return request("/events", "POST", data);
  },

  listEvents() {
    return request("/events");
  },

  getEventResponses(eventId) {
    return request(`/events/${eventId}/responses`);
  },

  deleteEvent(id) {
    return request(`/admin/events/${id}`, "DELETE");
  },

  listAvailability() {
    return request("/admin/availability");
  },
};
