import { useEffect, useState } from "react";
import { Title, Button, Box, Text, Divider, Group } from "@mantine/core";
import { userAPI, getToken, clearToken } from "../api/api.js";

import WeekCalendar from "../components/WeekCalendar.jsx";
import EventsSection from "../components/EventsSection.jsx";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = semana actual, 1 = siguiente

  useEffect(() => {
    if (!getToken()) {
      window.location = "/";
      return;
    }

    userAPI
      .me()
      .then(setUser)
      .catch(() => {
        clearToken();
        window.location = "/";
      });
  }, []);

  function logout() {
    clearToken();
    window.location = "/";
  }

  if (!user) return null;

  return (
    <Box p="lg">
      {/* Cabecera */}
      <Box
        mb="lg"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box>
          <Title order={2}>Camarada, {user.full_name}</Title>
          <Text size="sm" c="dimmed">
            {user.email}
          </Text>
        </Box>

        <Button color="red" onClick={logout}>
          Cerrar sesión
        </Button>
      </Box>

      <Divider my="md" />

      {/* Botones de navegación */}
      <Group mb="md">
        <Button
          variant={weekOffset === 0 ? "filled" : "light"}
          onClick={() => setWeekOffset(0)}
        >
          Semana actual
        </Button>

        <Button
          variant={weekOffset === 1 ? "filled" : "light"}
          onClick={() => setWeekOffset(1)}
        >
          Semana siguiente
        </Button>
      </Group>

      {/* Contenido principal */}
      <Box
        mt="md"
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "1.5rem",
        }}
      >
        {/* Calendario */}
        <Box
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            padding: "1rem",
            backgroundColor: "white",
          }}
        >
          <WeekCalendar offsetWeeks={weekOffset} />
        </Box>

        {/* Eventos */}
        <Box
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            padding: "1rem",
            backgroundColor: "white",
          }}
        >
          <EventsSection />
        </Box>
      </Box>
    </Box>
  );
}
