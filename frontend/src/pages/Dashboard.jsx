import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Title, Button, Box, Text, Divider, Group, Tabs, Card } from "@mantine/core";
import { userAPI, getToken, clearToken } from "../api/api.js";
import WeekCalendar from "../components/WeekCalendar.jsx";
import EventsSection from "../components/EventsSection.jsx";
import SpaceReservations from "../components/SpaceReservations.jsx";

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

  const defaultTab = user.availabilities_enabled
    ? "availability"
    : user.events_enabled
    ? "events"
    : user.spaces_enabled
    ? "reservations"
    : "availability";

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
          {(user.role === "admin" || user.role === "superadmin") && (
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

      <Box>
        <Title order={3} mb="md">
          Panel de usuario
        </Title>

        <Tabs defaultValue={defaultTab}>
          <Tabs.List>
            {user.availabilities_enabled && <Tabs.Tab value="availability">Disponibilidad</Tabs.Tab>}
            {user.events_enabled && <Tabs.Tab value="events">Eventos</Tabs.Tab>}
            {user.spaces_enabled && <Tabs.Tab value="reservations">Reserva espacios</Tabs.Tab>}
          </Tabs.List>

          {user.availabilities_enabled && (
            <Tabs.Panel value="availability" pt="md">
              <Card
                style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: "1rem" }}
                mb="md"
              >
                <Group mb="md">
                  <Title order={4}>Disponibilidad</Title>

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
                  Haz clic en las celdas para marcar o desmarcar tu disponibilidad por horas.
                </Text>

                <WeekCalendar offsetWeeks={offsetWeeks} />
              </Card>
            </Tabs.Panel>
          )}

          {user.events_enabled && (
            <Tabs.Panel value="events" pt="md">
              <Card
                style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: "1rem" }}
                mb="md"
              >
                <EventsSection />
              </Card>
            </Tabs.Panel>
          )}

          {user.spaces_enabled && (
            <Tabs.Panel value="reservations" pt="md">
              <Card
                style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: "1rem" }}
                mb="md"
              >
                <SpaceReservations />
              </Card>
            </Tabs.Panel>
          )}
        </Tabs>
      </Box>
    </Box>
  );
}