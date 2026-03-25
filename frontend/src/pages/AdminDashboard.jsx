import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Title, Tabs, Box, Button, Group, Text } from "@mantine/core";
import { userAPI, clearToken } from "../api/api.js";
import AdminUsers from "../components/AdminUsers.jsx";
import AdminEvents from "../components/AdminEvents.jsx";
import AdminAvailabilitiesCalendar from "../components/AdminAvailabilitiesCalendar.jsx";
import AdminSpaces from "../components/AdminSpaces.jsx";
import AdminDomainPolicies from "../components/AdminDomainPolicies.jsx";
import AdminCensus from "../components/AdminCensus.jsx";

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const u = await userAPI.me();
        if (u.role !== "admin" && u.role !== "superadmin") {
          navigate("/dashboard");
          return;
        }
        setUser(u);
      } catch {
        clearToken();
        navigate("/");
      }
    })();
  }, [navigate]);

  function logout() {
    clearToken();
    navigate("/");
  }

  if (!user) return null;

  const canEvents = user.role === "superadmin" || user.events_enabled;
  const canAvailabilities = user.role === "superadmin" || user.availabilities_enabled;
  const canSpaces = user.role === "superadmin" || user.spaces_enabled;
  const canUsers = user.role === "superadmin" || user.users_enabled;
  const canDomainPolicies = user.role === "superadmin" || user.domain_policies_enabled;
  const canCensus = user.role === "superadmin";

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
    : null;

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

      <Tabs mt="lg" defaultValue={defaultTab ?? undefined}>
        <Tabs.List>
          {canEvents && <Tabs.Tab value="events">Eventos</Tabs.Tab>}
          {canAvailabilities && <Tabs.Tab value="availabilities-calendar">Calendario de disponibilidad</Tabs.Tab>}
          {canSpaces && <Tabs.Tab value="spaces">Espacios</Tabs.Tab>}
          {canUsers && <Tabs.Tab value="users">Usuarios</Tabs.Tab>}
          {canDomainPolicies && (
            <Tabs.Tab value="domain-policies">Políticas de colectivo</Tabs.Tab>
          )}
          {canCensus && <Tabs.Tab value="censo">Censo</Tabs.Tab>}
        </Tabs.List>

        {canUsers && (
          <Tabs.Panel value="users" pt="xl">
            <AdminUsers />
          </Tabs.Panel>
        )}

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

        {canDomainPolicies && (
          <Tabs.Panel value="domain-policies" pt="xl">
            <AdminDomainPolicies />
          </Tabs.Panel>
        )}

        {canCensus && (
          <Tabs.Panel value="censo" pt="xl">
            <AdminCensus />
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
