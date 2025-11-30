import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Title, Tabs, Box, Button, Group } from "@mantine/core";
import { userAPI, clearToken } from "../api/api.js";
import AdminUsers from "../components/AdminUsers.jsx";
import AdminEvents from "../components/AdminEvents.jsx";
import AdminAvailabilities from "../components/AdminAvailabilities.jsx";
import AdminAvailabilitiesCalendar from "../components/AdminAvailabilitiesCalendar.jsx";

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const u = await userAPI.me();
        if (u.role !== "admin") {
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

      <Tabs mt="lg" defaultValue="availabilities-calendar">
        <Tabs.List>
          <Tabs.Tab value="events">Eventos</Tabs.Tab>
          <Tabs.Tab value="availabilities-calendar">Calendario de disponibilidad</Tabs.Tab>
          <Tabs.Tab value="availabilities">Disponibilidades semanales</Tabs.Tab>
          <Tabs.Tab value="users">Usuarios</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="users" pt="xl">
          <AdminUsers />
        </Tabs.Panel>

        <Tabs.Panel value="events" pt="xl">
          <AdminEvents />
        </Tabs.Panel>

        <Tabs.Panel value="availabilities" pt="xl">
          <AdminAvailabilities />
        </Tabs.Panel>

        <Tabs.Panel value="availabilities-calendar" pt="xl">
          <AdminAvailabilitiesCalendar />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
