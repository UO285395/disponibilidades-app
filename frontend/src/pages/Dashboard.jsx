import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Title, Button, Box, Text, Divider, Group, Tabs, Card } from "@mantine/core";
import { clearToken } from "../api/api.js";
import { useSessionUser } from "../hooks/useSessionUser.js";
import MobileWeekCalendar from "../components/MobileWeekCalendar.jsx";
import EventsSection from "../components/EventsSection.jsx";
import SpaceReservations from "../components/SpaceReservations.jsx";
import { initMobileNotifications } from "../services/mobileNotifications.js";
import ChangePasswordModal from "../components/ChangePasswordModal.jsx";

export default function Dashboard() {
  const { user, ready } = useSessionUser();
  const [offsetWeeks, setOffsetWeeks] = useState(0);
  const navigate = useNavigate();
  const [changePasswordOpened, setChangePasswordOpened] = useState(false);

  useEffect(() => {
    if (!user) return;
    initMobileNotifications().catch((e) => {
      console.error("No se pudo inicializar push móvil", e);
    });
  }, [user]);

  async function logout() {
    await clearToken();
    navigate("/");
  }

  if (!ready) {
    return (
      <Box p="lg" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <Text c="dimmed">Comprobando sesión…</Text>
      </Box>
    );
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
                    <Button variant="outline" onClick={() => setChangePasswordOpened(true)}>
                      Cambiar contraseña
                    </Button>
          <Button color="red" onClick={logout}>
            Cerrar sesión
          </Button>
        </Group>

            <ChangePasswordModal
              opened={changePasswordOpened}
              onClose={() => setChangePasswordOpened(false)}
            />
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
                <Title order={4} mb="xs">Disponibilidad</Title>
                <Group mb="md">
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
                  <Button
                    size="xs"
                    variant={offsetWeeks === 2 ? "filled" : "outline"}
                    onClick={() => setOffsetWeeks(2)}
                  >
                    Semana posterior
                  </Button>
                </Group>

                <Text size="sm" c="dimmed" mb="md">
                  Haz clic en las celdas para marcar o desmarcar tu disponibilidad por horas.
                </Text>

                <MobileWeekCalendar offsetWeeks={offsetWeeks} />
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
                <SpaceReservations currentUser={user} />
              </Card>
            </Tabs.Panel>
          )}
        </Tabs>
      </Box>
    </Box>
  );
}