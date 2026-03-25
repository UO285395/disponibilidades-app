import { request } from "./api.js";

export const adminAPI = {
  listUsers() {
    return request("/admin/users");
  },

  createUser(payload) {
    return request("/admin/users", "POST", payload);
  },

  deleteUser(userId) {
    return request(`/admin/users/${userId}`, "DELETE");
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

  getEvent(id) {
  return request(`/events/${id}`);
  },


  createEvent(payload) {
    return request("/events", "POST", payload);
  },

  deleteEvent(id) {
  return request(`/events/${id}`, "DELETE");
},


  getEventResponses(eventId) {
    return request(`/events/${eventId}/responses`);
  },

  // Disponibilidades de todos
  listAvailabilities() {
    return request("/admin/availability");
  },

  // Espacios
  listSpaces() {
    return request("/spaces");
  },

  createSpace(name, description) {
    return request("/spaces", "POST", { name, description });
  },

  deleteSpace(spaceId) {
    return request(`/spaces/${spaceId}`, "DELETE");
  },

  // Reservas admin
  listReservations() {
    return request("/admin/reservations");
  },

  // Políticas de Dominio (superadmin)
  listDomainPolicies() {
    return request("/admin/domain-policies");
  },

  createDomainPolicy(payload) {
    return request("/admin/domain-policies", "POST", payload);
  },

  updateDomainPolicy(id, payload) {
    return request(`/admin/domain-policies/${id}`, "PUT", payload);
  },

  deleteDomainPolicy(id) {
    return request(`/admin/domain-policies/${id}`, "DELETE");
  },

  // Censo
  getCensusConfig() {
    return request("/admin/census");
  },

  upsertCensusConfig(payload) {
    return request("/admin/census", "PUT", payload);
  },

  regenerateCensusToken() {
    return request("/admin/census/regenerate-token", "POST");
  },

  testCensusEmail() {
    return request("/admin/census/test-email", "POST");
  },
};
