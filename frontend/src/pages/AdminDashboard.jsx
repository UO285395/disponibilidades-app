import { lazy, Suspense, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Title, Box, Button, Group, Text, Menu, ActionIcon, Center, Loader, Paper,
} from "@mantine/core";
import {
  IconCalendarEvent, IconCalendarTime, IconBuildingCommunity, IconUsers,
  IconSitemap, IconAdjustments, IconClipboardList, IconChartBar, IconBell,
  IconChevronDown, IconArrowLeft, IconLogout, IconDotsVertical, IconChartPie,
} from "@tabler/icons-react";
import { clearToken } from "../api/api.js";
import { useSessionUser } from "../hooks/useSessionUser.js";
import OrgScopeBar from "../components/OrgScopeBar.jsx";
import SessionExpiredModal from "../components/SessionExpiredModal.jsx";

// Cada sección del panel es un chunk aparte: abrir "Eventos" no descarga el
// código de Censo, Encuestas u Organigrama. Importante en web móvil.
const AdminUsers = lazy(() => import("../components/AdminUsers.jsx"));
const AdminEvents = lazy(() => import("../components/AdminEvents.jsx"));
const AdminAvailabilitiesCalendar = lazy(() => import("../components/AdminAvailabilitiesCalendar.jsx"));
const AdminSpaces = lazy(() => import("../components/AdminSpaces.jsx"));
const AdminDomainPolicies = lazy(() => import("../components/AdminDomainPolicies.jsx"));
const AdminCensus = lazy(() => import("../components/AdminCensus.jsx"));
const AdminNotifications = lazy(() => import("../components/AdminNotifications.jsx"));
const AdminSurveys = lazy(() => import("../components/AdminSurveys.jsx"));
const AdminOrgStructure = lazy(() => import("../components/AdminOrgStructure.jsx"));
const AdminMetrics = lazy(() => import("../components/AdminMetrics.jsx"));

// Cada sección: permiso, etiqueta, icono y componente. El orden es una jerarquía
// lógica (lo más usado arriba).
const SECTIONS = [
  { value: "events", label: "Eventos", icon: IconCalendarEvent, can: (u) => u.role === "superadmin" || u.events_enabled, render: (u) => <AdminEvents currentUser={u} /> },
  { value: "availabilities-calendar", label: "Disponibilidad", icon: IconCalendarTime, can: (u) => u.role === "superadmin" || u.availabilities_enabled, render: () => <AdminAvailabilitiesCalendar /> },
  { value: "spaces", label: "Espacios", icon: IconBuildingCommunity, can: (u) => u.role === "superadmin" || u.spaces_enabled, render: () => <AdminSpaces /> },
  { value: "users", label: "Usuarios", icon: IconUsers, can: (u) => u.role === "superadmin" || u.users_enabled, render: (u) => <AdminUsers currentUser={u} /> },
  { value: "organigrama", label: "Organigrama", icon: IconSitemap, can: (u) => u.role === "admin" || u.role === "superadmin", render: () => <AdminOrgStructure /> },
  { value: "domain-policies", label: "Políticas", icon: IconAdjustments, can: (u) => u.role === "superadmin" || u.domain_policies_enabled, render: () => <AdminDomainPolicies /> },
  { value: "censo", label: "Censo", icon: IconClipboardList, can: (u) => u.role === "superadmin" || u.census_enabled, render: () => <AdminCensus /> },
  { value: "surveys", label: "Encuestas", icon: IconChartBar, can: (u) => u.role === "superadmin" || u.surveys_enabled, render: () => <AdminSurveys /> },
  { value: "metrics", label: "Métricas", icon: IconChartPie, can: (u) => u.role === "admin" || u.role === "superadmin", render: () => <AdminMetrics /> },
  { value: "notifications", label: "Notificaciones", icon: IconBell, can: (u) => u.role === "superadmin" || u.notifications_enabled, render: () => <AdminNotifications /> },
];

export default function AdminDashboard() {
  const { user, ready, sessionExpired } = useSessionUser({ requireAdmin: true });
  const [active, setActive] = useState(null);
  const navigate = useNavigate();

  const sections = useMemo(() => (user ? SECTIONS.filter((s) => s.can(user)) : []), [user]);

  function selectSection(value) {
    setActive(value);
    try { if (user) localStorage.setItem(`admin-section-${user.id}`, value); } catch { /* ignore */ }
  }

  async function logout() {
    await clearToken();
    navigate("/");
  }

  if (!ready) return <Center h="60vh"><Loader /></Center>;
  if (sessionExpired) return <SessionExpiredModal opened />;
  if (!user) return null;

  // Sección actual: la elegida, si no la última recordada, si no la primera.
  // Se deriva en render (sin efecto) para evitar renders en cascada.
  let savedValue = null;
  try { savedValue = localStorage.getItem(`admin-section-${user.id}`); } catch { /* ignore */ }
  const current =
    sections.find((s) => s.value === active) ||
    sections.find((s) => s.value === savedValue) ||
    sections[0];

  return (
    <Box style={{ maxWidth: 960, margin: "0 auto" }} p="md" pb="xl">
      {/* Cabecera */}
      <Group justify="space-between" align="center" mb="sm" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <Button
            variant="subtle"
            size="sm"
            pl={4}
            leftSection={<IconArrowLeft size={18} />}
            onClick={() => navigate("/dashboard")}
          >
            Volver
          </Button>
          <Title order={3} truncate>Administración</Title>
        </Group>

        <Menu position="bottom-end" shadow="md">
          <Menu.Target>
            <ActionIcon variant="subtle" size="lg" aria-label="Cuenta">
              <IconDotsVertical size={22} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item color="red" leftSection={<IconLogout size={18} />} onClick={logout}>
              Cerrar sesión
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <OrgScopeBar />

      {sections.length === 0 ? (
        <Text c="dimmed" mt="xl">Tu estructura no tiene módulos de administración habilitados.</Text>
      ) : (
        <>
          {/* Selector de sección: muestra la actual y abre la lista completa. */}
          <Menu position="bottom-start" shadow="md" width="target">
            <Menu.Target>
              <Button
                fullWidth
                justify="space-between"
                variant="light"
                size="md"
                mb="md"
                leftSection={current?.icon ? <current.icon size={20} /> : null}
                rightSection={<IconChevronDown size={18} />}
              >
                {current?.label}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {sections.map((s) => (
                <Menu.Item
                  key={s.value}
                  leftSection={<s.icon size={18} />}
                  onClick={() => selectSection(s.value)}
                  bg={s.value === current?.value ? "var(--mantine-color-indigo-light)" : undefined}
                >
                  {s.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>

          <Paper key={current?.value}>
            <Suspense fallback={<Center py="xl"><Loader /></Center>}>
              {current?.render(user)}
            </Suspense>
          </Paper>
        </>
      )}
    </Box>
  );
}
