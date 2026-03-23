import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Title, Button, Box, Text, Divider, Group } from "@mantine/core";
import { userAPI, getToken, clearToken } from "../api/api.js";
import WeekCalendar from "../components/WeekCalendar.jsx";
import EventsSection from "../components/EventsSection.jsx";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [offsetWeeks, setOffsetWeeks] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!getToken()) {
      navigate("/");
      return;
    }

    (async () => {
      try {
        const u = await userAPI.me();
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
      {/* ================= CABECERA ================= */}
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

        <Group>
          {user.role === "admin" && (
            <Button variant="outline" onClick={() => navigate("/admin")}>
              Ir al panel admin
            </Button>
          )}
           <Button color="red" onClick={logout}>
            Cerrar sesión
          </Button>
        </Group>
      </Box>

      <Divider my="md" />

      {/* ================= CONTENIDO ================= */}
      <Box
        mt="md"
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "1.5rem",
        }}
      >
        {/* ===== Calendario ===== */}
        <Box
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            padding: "1rem",
            backgroundColor: "white",
          }}
        >
          <Group mb="md">
            <Title order={3}>Disponibilidad</Title>

             <Button
              size="xs"
              variant={offsetWeeks === 0 ? "filled" : "outline"}
              onClick={() => setOffsetWeeks(0)}
            >
              Semana actual
            </Button>
            <Button
              size="xs"
              variant={offsetWeeks === 1 ? "filled" : "outline"}
              onClick={() => setOffsetWeeks(1)}
            >
              Semana siguiente
            </Button>
          </Group>

          <Text size="sm" c="dimmed" mb="md">
            Haz clic en las celdas para marcar o desmarcar tu disponibilidad por horas.</Text>

          <WeekCalendar offsetWeeks={offsetWeeks} />
        </Box>

        {/* ===== Eventos ===== */}
        <Box
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            padding: "1rem",
            backgroundColor: "white"
          }}
        >
          <EventsSection />
        </Box>
      </Box>
    </Box>
  );
}