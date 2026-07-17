import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Title, Text, Card, Button, Group, Badge, Stack, Select } from "@mantine/core";
import { eventsAPI, calendarAPI } from "../api/api.js";
import AddToCalendarButton from "../components/AddToCalendarButton.jsx";

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
    <Box p="lg" style={{ maxWidth: 700, margin: "0 auto" }}>
      <Group justify="space-between" align="center" mb="lg">
        <Title order={2}>Próximos eventos</Title>
        <Button variant="outline" onClick={() => navigate("/login")}>
          Acceso militantes
        </Button>
      </Group>

      <Select
        label="Provincia"
        description="Elige tu provincia para ver los eventos de tu zona. Los eventos generales se muestran siempre."
        placeholder="Todas las provincias"
        data={provinces.map((p) => ({ value: String(p.id), label: p.name }))}
        value={provinceId}
        onChange={handleProvinceChange}
        clearable
        searchable
        mb="md"
        maw={360}
      />

      {events.length > 0 && (
        <Button
          variant="light"
          mb="md"
          onClick={() => calendarAPI.download("public", provinceId ? Number(provinceId) : null).catch((e) => alert(e.message))}
        >
          Añadir todos a mi calendario (.ics)
        </Button>
      )}

      {loading && <Text c="dimmed">Cargando eventos…</Text>}
      {error && <Text c="red">{error}</Text>}
      {!loading && !error && events.length === 0 && (
        <Text c="dimmed">No hay eventos públicos programados por ahora.</Text>
      )}

      <Stack gap="md">
        {events.map((ev) => (
          <Card
            key={ev.id}
            shadow="sm"
            p="md"
            radius="md"
            style={{ cursor: "pointer" }}
            onClick={() => navigate(`/eventos/${ev.id}`)}
          >
            <Group justify="space-between" align="flex-start" mb="xs">
              <Text fw={700}>{ev.title}</Text>
              <Badge color={ev.event_type === "informativo" ? "blue" : "teal"}>
                {ev.event_type === "informativo" ? "Informativo" : "Participativo"}
              </Badge>
            </Group>

            <Text size="sm" c="dimmed">
              {ev.date}
              {ev.start_time && ` · ${ev.start_time}`}
              {ev.location && ` · ${ev.location}`}
            </Text>

            {ev.description && (
              <Text size="sm" mt="xs" lineClamp={3}>
                {ev.description}
              </Text>
            )}

            <Group justify="flex-end" mt="xs">
              <AddToCalendarButton event={ev} />
            </Group>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
