import { request } from "./api.js";

export const adminAPI = {
  // unitId acota a esa estructura y a las que dependen de ella
  listUsers(unitId = null) {
    const qs = unitId ? `?unit_id=${unitId}` : "";
    return request(`/admin/users${qs}`);
  },

  updateUserOrgUnit(userId, orgUnitId) {
    return request(`/admin/users/${userId}/org-unit`, "PUT", { org_unit_id: orgUnitId });
  },

  createUser(payload) {
    return request("/admin/users", "POST", payload);
  },

  deleteUser(userId) {
    return request(`/admin/users/${userId}`, "DELETE");
  },

  updateUserGroupTag(userId, groupTag) {
    return request(`/admin/users/${userId}/group-tag`, "PUT", {
      group_tag: groupTag,
    });
  },

  addUserGroupTag(userId, tag) {
    return request(`/admin/users/${userId}/group-tags`, "POST", { tag });
  },

  removeUserGroupTag(userId, tag) {
    return request(`/admin/users/${userId}/group-tags/${encodeURIComponent(tag)}`, "DELETE");
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

  editEvent(id, payload) {
    return request(`/events/${id}`, "PUT", payload);
  },

  deleteEvent(id) {
    return request(`/events/${id}`, "DELETE");
  },


  getEventResponses(eventId) {
    return request(`/events/${eventId}/responses`);
  },

  getEventGuestResponses(eventId) {
    return request(`/events/${eventId}/guest-responses`);
  },

  // Disponibilidades de todos (unitId acota a esa unidad y su rama)
  listAvailabilities(unitId = null) {
    const qs = unitId ? `?unit_id=${unitId}` : "";
    return request(`/admin/availability${qs}`);
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

  testCensusEmail(payload = {}) {
    return request("/admin/census/test-email", "POST", payload);
  },

  // Encuestas (superadmin)
  listSurveys() {
    return request("/admin/surveys");
  },

  createSurvey(payload) {
    return request("/admin/surveys", "POST", payload);
  },

  updateSurvey(surveyId, payload) {
    return request(`/admin/surveys/${surveyId}`, "PUT", payload);
  },

  deleteSurvey(surveyId) {
    return request(`/admin/surveys/${surveyId}`, "DELETE");
  },

  regenerateSurveyToken(surveyId) {
    return request(`/admin/surveys/${surveyId}/regenerate-token`, "POST");
  },

  getSurveyResponses(surveyId) {
    return request(`/admin/surveys/${surveyId}/responses`);
  },

  sendNotification(payload) {
    return request("/admin/notifications/send", "POST", payload);
  },

  // ---- Organigrama / estructura ----
  orgScope() {
    return request("/me/org-scope");
  },

  orgLevelTypes() {
    return request("/admin/org/level-types");
  },

  orgTree() {
    return request("/admin/org/tree");
  },

  orgAggregate(unitId = null) {
    const qs = unitId ? `?unit_id=${unitId}` : "";
    return request(`/admin/org/aggregate${qs}`);
  },

  orgCreateUnit(payload) {
    return request("/admin/org/units", "POST", payload);
  },

  orgRenameUnit(unitId, name) {
    return request(`/admin/org/units/${unitId}`, "PUT", { name });
  },

  orgMoveUnit(unitId, newParentId) {
    return request(`/admin/org/units/${unitId}/move`, "POST", { new_parent_id: newParentId });
  },

  orgDeactivateUnit(unitId) {
    return request(`/admin/org/units/${unitId}/deactivate`, "POST");
  },

  orgDeleteUnit(unitId) {
    return request(`/admin/org/units/${unitId}`, "DELETE");
  },

  orgReactivateUnit(unitId) {
    return request(`/admin/org/units/${unitId}/reactivate`, "POST");
  },

  orgUnitAdmins(unitId) {
    return request(`/admin/org/units/${unitId}/admins`);
  },

  orgGrantAdmin(unitId, userId, scope = "subtree") {
    return request(`/admin/org/units/${unitId}/admins`, "POST", { user_id: userId, scope });
  },

  orgRevokeAdmin(assignmentId) {
    return request(`/admin/org/assignments/${assignmentId}`, "DELETE");
  },

  orgUnitTerritories(unitId) {
    return request(`/admin/org/units/${unitId}/territories`);
  },

  orgAddTerritory(unitId, territoryType, territoryId) {
    return request(`/admin/org/units/${unitId}/territories`, "POST", {
      territory_type: territoryType,
      territory_id: territoryId,
    });
  },

  orgDeleteTerritory(territoryRowId) {
    return request(`/admin/org/territories/${territoryRowId}`, "DELETE");
  },

  geoCommunities() {
    return request("/admin/geo/communities");
  },

  geoProvinces() {
    return request("/geo/provinces");
  },

  geoCities(provinceId) {
    return request(`/admin/geo/cities?province_id=${provinceId}`);
  },

  geoCreateCity(name, provinceId) {
    return request("/admin/geo/cities", "POST", { name, province_id: provinceId });
  },

  usersInUnit(unitId) {
    return request(`/admin/users?unit_id=${unitId}`);
  },
};
