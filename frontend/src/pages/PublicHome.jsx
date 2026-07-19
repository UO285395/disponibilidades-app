import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Title, Text, Card, Button, Group, Badge, Stack, Select, Loader, Center,
} from "@mantine/core";
import {
  IconLogin2, IconMapPin, IconCalendarEvent, IconClock, IconChevronRight,
  IconCalendarPlus, IconMoodEmpty,
} from "@tabler/icons-react";
import { eventsAPI, calendarAPI } from "../api/api.js";
import AddToCalendarButton from "../components/AddToCalendarButton.jsx";
import { formatDate, formatTime } from "../utils/datetime.js";
import { notifyError } from "../utils/notify.js";

const PROVINCE_KEY = "public_province_id";

export default function PublicHome() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [provinces, setProvinces] = useState([]);
  const [provinceId, setProvinceId] = useState(() => {
    try { return localStorage.getItem(PROVINCE_KEY) || null; } catch { return null; }
  });
  const navigate = useNavigate();

  // Lista fija y pública de provincias (no depende de qué unidades existen).
  useEffect(() => {
    eventsAPI.listProvinces()
      .then((data) => setProvinces(data))
      .catch(() => setProvinces([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const data = await eventsAPI.listPublic(provinceId ? Number(provinceId) : null);
        setEvents(data);
        setError(null);
      } catch (e) {
        console.error("Error cargando eventos públicos", e);
        setError("No se pudieron cargar los eventos.");
      } finally {
        setLoading(false);
      }
    })();
  }, [provinceId]);

  function handleProvinceChange(value) {
    setProvinceId(value);
    try {
      if (value) localStorage.setItem(PROVINCE_KEY, value);
      else localStorage.removeItem(PROVINCE_KEY);
    } catch {
      // localStorage no disponible: el filtro sigue funcionando en memoria.
    }
  }

  return (
    <Box style={{ maxWidth: 720, margin: "0 auto" }} p="md" pb="xl">
      <Group justify="space-between" align="center" mb="md" wrap="nowrap">
        <Title order={1}>Próximos eventos</Title>
        <Button
          variant="light"
          leftSection={<IconLogin2 size={18} />}
          onClick={() => navigate("/login")}
        >
          Acceso
        </Button>
      </Group>

      <Select
        label="Tu provincia"
        description="Verás los eventos de tu zona. Los eventos generales aparecen siempre."
        placeholder="Todas las provincias"
        leftSection={<IconMapPin size={18} />}
        data={provinces.map((p) => ({ value: String(p.id), label: p.name }))}
        value={provinceId}
        onChange={handleProvinceChange}
        clearable
        searchable
        mb="md"
      />

      {events.length > 0 && (
        <Button
          variant="subtle"
          leftSection={<IconCalendarPlus size={18} />}
          mb="md"
          onClick={() => calendarAPI.download("public", provinceId ? Number(provinceId) : null).catch((e) => notifyError(e.message))}
        >
          Añadir todos a mi calendario
        </Button>
      )}

      {loading && (
        <Center py="xl"><Loader /></Center>
      )}

      {error && <Text c="red" ta="center" py="md">{error}</Text>}

      {!loading && !error && events.length === 0 && (
        <Center py="xl">
          <Stack align="center" gap="xs">
            <IconMoodEmpty size={40} color="var(--mantine-color-gray-5)" />
            <Text c="dimmed" ta="center">No hay eventos públicos programados por ahora.</Text>
          </Stack>
        </Center>
      )}

      <Stack gap="sm">
        {events.map((ev) => (
          <Card
            key={ev.id}
            shadow="xs"
            padding="md"
            role="button"
            tabIndex={0}
            style={{ cursor: "pointer" }}
            onClick={() => navigate(`/eventos/${ev.id}`)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && navigate(`/eventos/${ev.id}`)}
          >
            <Group justify="space-between" align="flex-start" mb={6} wrap="nowrap">
              <Text fw={600} fz="lg" style={{ flex: 1 }}>{ev.title}</Text>
              <Badge variant="light" color={ev.event_type === "informativo" ? "blue" : "teal"}>
                {ev.event_type === "informativo" ? "Informativo" : "Participativo"}
              </Badge>
            </Group>

            <Group gap="lg" mb={ev.description ? 6 : 0}>
              <Group gap={4} wrap="nowrap">
                <IconCalendarEvent size={16} color="var(--mantine-color-dimmed)" />
                <Text size="sm" c="dimmed">{formatDate(ev.date)}</Text>
              </Group>
              {ev.start_time && (
                <Group gap={4} wrap="nowrap">
                  <IconClock size={16} color="var(--mantine-color-dimmed)" />
                  <Text size="sm" c="dimmed">{formatTime(ev.start_time)}</Text>
                </Group>
              )}
              {ev.location && (
                <Group gap={4} wrap="nowrap">
                  <IconMapPin size={16} color="var(--mantine-color-dimmed)" />
                  <Text size="sm" c="dimmed">{ev.location}</Text>
                </Group>
              )}
            </Group>

            {ev.description && (
              <Text size="sm" c="dimmed" lineClamp={2}>{ev.description}</Text>
            )}

            <Group justify="space-between" align="center" mt="sm">
              <AddToCalendarButton event={ev} size="sm" variant="light" />
              <Group gap={2} wrap="nowrap">
                <Text size="sm" c="indigo" fw={500}>Ver detalle</Text>
                <IconChevronRight size={16} color="var(--mantine-color-indigo-6)" />
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
