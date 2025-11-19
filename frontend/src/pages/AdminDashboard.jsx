import { useEffect, useState } from "react";
import { Title, Tabs, Box } from "@mantine/core";
import { userAPI, clearToken } from "../api/api.js";
import AdminUsers from "./AdminUsers.jsx";
import AdminEvents from "./AdminEvents.jsx";
import AdminAvailabilities from "./AdminAvailabilities.jsx";

export default function AdminDashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    userAPI
      .me()
      .then((u) => {
        if (u.role !== "admin") {
          window.location = "/dashboard";
        }
        setUser(u);
      })
      .catch(() => {
        clearToken();
        window.location = "/";
      });
  }, []);

  if (!user) return null;

  return (
    <Box p="lg">
      <Title order={2}>Panel de Administración</Title>

      <Tabs mt="lg" defaultValue="users">
        <Tabs.List>
          <Tabs.Tab value="events">Eventos</Tabs.Tab>
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
      </Tabs>
    </Box>
  );
}
