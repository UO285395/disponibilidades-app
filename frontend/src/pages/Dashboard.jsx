import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Title, Button, Box, Text, Group, Tabs, Card, Menu, ActionIcon, Avatar,
  Center, Loader, SegmentedControl, Stack, Badge,
} from "@mantine/core";
import {
  IconCalendarTime, IconCalendarEvent, IconBuildingCommunity, IconDotsVertical,
  IconUserShield, IconKey, IconLogout,
} from "@tabler/icons-react";
import { clearToken, eventsAPI } from "../api/api.js";
import { useSessionUser } from "../hooks/useSessionUser.js";
import MobileWeekCalendar from "../components/MobileWeekCalendar.jsx";
import EventsSection from "../components/EventsSection.jsx";
import SpaceReservations from "../components/SpaceReservations.jsx";
import ChangePasswordModal from "../components/ChangePasswordModal.jsx";
import SessionExpiredModal from "../components/SessionExpiredModal.jsx";

function initials(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default function Dashboard() {
  const { user, ready, sessionExpired } = useSessionUser();
  const [offsetWeeks, setOffsetWeeks] = useState("0");
  const navigate = useNavigate();
  const [changePasswordOpened, setChangePasswordOpened] = useState(false);
  const [pendingEvents, setPendingEvents] = useState(0);

  // Conteo ligero de eventos sin responder para el badge de la pestaña.
  // Se hace aquí porque el panel de eventos no está montado si la pestaña no
  // está activa (keepMounted={false}).
  useEffect(() => {
    if (!user?.events_enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const [events, myResponses] = await Promise.all([
          eventsAPI.list(),
          eventsAPI.myResponses(),
        ]);
        if (cancelled) return;
        const answered = new Set(
          (myResponses || []).map((r) => Number(r && typeof r === "object" ? r.event_id : r))
        );
        const pending = (events || []).filter((ev) => !answered.has(Number(ev.id))).length;
        setPendingEvents(pending);
      } catch {
        // Silencioso: el badge es informativo, no crítico.
      }
    })();
    return () => { cancelled = true; };
  }, [user?.events_enabled]);

  async function logout() {
    await clearToken();
    navigate("/");
  }

  if (!ready) return <Center h="60vh"><Loader /></Center>;
  if (sessionExpired) return <SessionExpiredModal opened />;
  if (!user) return null;

  const isAdmin = user.role === "admin" || user.role === "superadmin";
  const defaultTab = user.availabilities_enabled
    ? "availability"
    : user.events_enabled
    ? "events"
    : "reservations";

  return (
    <Box style={{ maxWidth: 820, margin: "0 auto" }} p="md" pb="xl">
      {/* ================= CABECERA ================= */}
      <Group justify="space-between" align="center" mb="md" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Avatar color="indigo" radius="xl">{initials(user.full_name)}</Avatar>
          <Box style={{ minWidth: 0 }}>
            <Text fw={600} truncate>{user.full_name}</Text>
            <Text size="xs" c="dimmed" truncate>{user.email}</Text>
          </Box>
        </Group>

        <Menu position="bottom-end" shadow="md" width={220}>
          <Menu.Target>
            <ActionIcon variant="subtle" size="lg" aria-label="Cuenta">
              <IconDotsVertical size={22} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {isAdmin && (
              <Menu.Item leftSection={<IconUserShield size={18} />} onClick={() => navigate("/admin")}>
                Panel de administración
              </Menu.Item>
            )}
            <Menu.Item leftSection={<IconKey size={18} />} onClick={() => setChangePasswordOpened(true)}>
              Cambiar contraseña
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconLogout size={18} />} onClick={logout}>
              Cerrar sesión
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <ChangePasswordModal
        opened={changePasswordOpened}
        onClose={() => setChangePasswordOpened(false)}
      />

      <Tabs defaultValue={defaultTab} variant="outline" keepMounted={false}>
        <Tabs.List grow mb="md">
          {user.availabilities_enabled && (
            <Tabs.Tab value="availability" leftSection={<IconCalendarTime size={18} />}>
              Disponibilidad
            </Tabs.Tab>
          )}
          {user.events_enabled && (
            <Tabs.Tab
              value="events"
              leftSection={<IconCalendarEvent size={18} />}
              rightSection={pendingEvents > 0 ? (
                <Badge size="sm" circle variant="filled" color="red">{pendingEvents}</Badge>
              ) : null}
            >
              Eventos
            </Tabs.Tab>
          )}
          {user.spaces_enabled && (
            <Tabs.Tab value="reservations" leftSection={<IconBuildingCommunity size={18} />}>
              Espacios
            </Tabs.Tab>
          )}
        </Tabs.List>

        {user.availabilities_enabled && (
          <Tabs.Panel value="availability">
            <Card>
              <Stack gap="sm">
                <Title order={4}>Mi disponibilidad</Title>
                <SegmentedControl
                  fullWidth
                  value={offsetWeeks}
                  onChange={setOffsetWeeks}
                  data={[
                    { label: "Esta semana", value: "0" },
                    { label: "Siguiente", value: "1" },
                    { label: "Posterior", value: "2" },
                  ]}
                />
                <Text size="sm" c="dimmed">
                  Toca las celdas para marcar o desmarcar tu disponibilidad por horas.
                </Text>
                <MobileWeekCalendar offsetWeeks={Number(offsetWeeks)} />
              </Stack>
            </Card>
          </Tabs.Panel>
        )}

        {user.events_enabled && (
          <Tabs.Panel value="events">
            <EventsSection />
          </Tabs.Panel>
        )}

        {user.spaces_enabled && (
          <Tabs.Panel value="reservations">
            <Card>
              <SpaceReservations currentUser={user} />
            </Card>
          </Tabs.Panel>
        )}
      </Tabs>
    </Box>
  );
}
