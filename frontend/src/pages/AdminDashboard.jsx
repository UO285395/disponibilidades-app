import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Title, Tabs, Box, Button, Group, Text } from "@mantine/core";
import { userAPI, clearToken, authAPI } from "../api/api.js";
import AdminUsers from "../components/AdminUsers.jsx";
import AdminEvents from "../components/AdminEvents.jsx";
import AdminAvailabilitiesCalendar from "../components/AdminAvailabilitiesCalendar.jsx";
import AdminSpaces from "../components/AdminSpaces.jsx";
import AdminDomainPolicies from "../components/AdminDomainPolicies.jsx";
import AdminCensus from "../components/AdminCensus.jsx";
import AdminNotifications from "../components/AdminNotifications.jsx";
import AdminSurveys from "../components/AdminSurveys.jsx";

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState(null);
  const [orderedTabs, setOrderedTabs] = useState([]);
  const [draggedTab, setDraggedTab] = useState(null);
  const navigate = useNavigate();

  const buildAvailableTabValues = useCallback((u) => {
    if (!u) return [];
    const values = [];
    if (u.role === "superadmin" || u.events_enabled) values.push("events");
    if (u.role === "superadmin" || u.availabilities_enabled) values.push("availabilities-calendar");
    if (u.role === "superadmin" || u.spaces_enabled) values.push("spaces");
    if (u.role === "superadmin" || u.users_enabled) values.push("users");
    if (u.role === "superadmin" || u.domain_policies_enabled) values.push("domain-policies");
    if (u.role === "superadmin") values.push("censo");
    if (u.role === "superadmin") values.push("surveys");
    if (u.role === "superadmin") values.push("notifications");
    return values;
  }, []);

  const initializeTabOrder = useCallback((u) => {
    const availableValues = buildAvailableTabValues(u);
    const key = `admin-tabs-order-${u.id}`;
    const raw = localStorage.getItem(key);

    let savedOrder = [];
    try {
      savedOrder = raw ? JSON.parse(raw) : [];
    } catch {
      savedOrder = [];
    }

    const validSaved = savedOrder.filter((value) => availableValues.includes(value));
    const missing = availableValues.filter((value) => !validSaved.includes(value));
    const nextOrder = [...validSaved, ...missing];

    setOrderedTabs(nextOrder);
    setActiveTab(nextOrder[0] ?? null);
  }, [buildAvailableTabValues]);

  useEffect(() => {
    (async () => {
      try {
        const u = await userAPI.me();
        if (u.role !== "admin" && u.role !== "superadmin") {
          navigate("/dashboard");
          return;
        }
        initializeTabOrder(u);
        setUser(u);
      } catch {
        try {
          await authAPI.refresh();
          const u = await userAPI.me();
          if (u.role !== "admin" && u.role !== "superadmin") {
            navigate("/dashboard");
            return;
          }
          initializeTabOrder(u);
          setUser(u);
        } catch {
          clearToken();
          navigate("/");
        }
      }
    })();
  }, [navigate, initializeTabOrder]);

  function logout() {
    clearToken();
    navigate("/");
  }

  const canEvents = Boolean(user && (user.role === "superadmin" || user.events_enabled));
  const canAvailabilities = Boolean(user && (user.role === "superadmin" || user.availabilities_enabled));
  const canSpaces = Boolean(user && (user.role === "superadmin" || user.spaces_enabled));
  const canUsers = Boolean(user && (user.role === "superadmin" || user.users_enabled));
  const canDomainPolicies = Boolean(user && (user.role === "superadmin" || user.domain_policies_enabled));
  const canCensus = Boolean(user && user.role === "superadmin");
  const canSurveys = Boolean(user && user.role === "superadmin");
  const canNotifications = Boolean(user && user.role === "superadmin");

  const tabDefs = useMemo(
    () => [
      canEvents ? { value: "events", label: "Eventos" } : null,
      canAvailabilities ? { value: "availabilities-calendar", label: "Calendario de disponibilidad" } : null,
      canSpaces ? { value: "spaces", label: "Espacios" } : null,
      canUsers ? { value: "users", label: "Usuarios" } : null,
      canDomainPolicies ? { value: "domain-policies", label: "Políticas de colectivo" } : null,
      canCensus ? { value: "censo", label: "Censo" } : null,
      canSurveys ? { value: "surveys", label: "Encuestas" } : null,
      canNotifications ? { value: "notifications", label: "Notificaciones" } : null,
    ].filter(Boolean),
    [canEvents, canAvailabilities, canSpaces, canUsers, canDomainPolicies, canCensus, canSurveys, canNotifications]
  );

  const storageKey = user ? `admin-tabs-order-${user.id}` : null;

  useEffect(() => {
    if (!storageKey || orderedTabs.length === 0) return;
    localStorage.setItem(storageKey, JSON.stringify(orderedTabs));
  }, [orderedTabs, storageKey]);

  const defaultTab = canEvents
    ? "events"
    : canAvailabilities
    ? "availabilities-calendar"
    : canSpaces
    ? "spaces"
    : canUsers
    ? "users"
    : canDomainPolicies
    ? "domain-policies"
    : canSurveys
    ? "surveys"
    : null;

  function handleDragStart(tabValue) {
    setDraggedTab(tabValue);
  }

  function handleDrop(targetTab) {
    if (!draggedTab || draggedTab === targetTab) return;

    const sourceIndex = orderedTabs.indexOf(draggedTab);
    const targetIndex = orderedTabs.indexOf(targetTab);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const next = [...orderedTabs];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setOrderedTabs(next);
    setDraggedTab(null);
  }

  const tabsByValue = Object.fromEntries(tabDefs.map((tab) => [tab.value, tab]));
  const renderedTabOrder = orderedTabs.length > 0 ? orderedTabs : tabDefs.map((t) => t.value);

  if (!user) return null;

  return (
    <Box p="lg">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Panel de Administración</Title>
        <Group>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            Volver al dashboard
          </Button>
          <Button color="red" onClick={logout}>
            Cerrar sesión
          </Button>
        </Group>
      </Group>

      <Tabs mt="lg" value={activeTab ?? defaultTab ?? undefined} onChange={setActiveTab}>
        <Tabs.List>
          {renderedTabOrder.map((value) => {
            const tab = tabsByValue[value];
            if (!tab) return null;
            return (
              <Box
                key={tab.value}
                draggable
                onDragStart={() => handleDragStart(tab.value)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(tab.value)}
              >
                <Tabs.Tab value={tab.value}>{tab.label}</Tabs.Tab>
              </Box>
            );
          })}
        </Tabs.List>

        
        {canEvents && (
          <Tabs.Panel value="events" pt="xl">
            <AdminEvents />
          </Tabs.Panel>
        )}

        {canSpaces && (
          <Tabs.Panel value="spaces" pt="xl">
            <AdminSpaces />
          </Tabs.Panel>
        )}

        {canAvailabilities && (
          <Tabs.Panel value="availabilities-calendar" pt="xl">
            <AdminAvailabilitiesCalendar />
          </Tabs.Panel>
        )}

        {canCensus && (
          <Tabs.Panel value="censo" pt="xl">
            <AdminCensus />
          </Tabs.Panel>
        )}

        {canSurveys && (
          <Tabs.Panel value="surveys" pt="xl">
            <AdminSurveys />
          </Tabs.Panel>
        )}

        {canNotifications && (
          <Tabs.Panel value="notifications" pt="xl">
            <AdminNotifications />
          </Tabs.Panel>
        )}

        {canDomainPolicies && (
          <Tabs.Panel value="domain-policies" pt="xl">
            <AdminDomainPolicies />
          </Tabs.Panel>
        )}

        {canUsers && (
          <Tabs.Panel value="users" pt="xl">
            <AdminUsers />
          </Tabs.Panel>
        )}


      </Tabs>

      {!defaultTab && (
        <Box mt="xl">
          <Text c="dimmed">Tu colectivo no tiene módulos de administración habilitados.</Text>
        </Box>
      )}
    </Box>
  );
}
