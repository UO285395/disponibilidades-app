import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Title, Text, Card, Button, Group, Badge, Stack } from "@mantine/core";
import { eventsAPI, calendarAPI } from "../api/api.js";

export default function PublicHome() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const data = await eventsAPI.listPublic();
        setEvents(data);
      } catch (e) {
        console.error("Error cargando eventos públicos", e);
        setError("No se pudieron cargar los eventos.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Box p="lg" style={{ maxWidth: 700, margin: "0 auto" }}>
      <Group justify="space-between" align="center" mb="lg">
        <Title order={2}>Próximos eventos</Title>
        <Button variant="outline" onClick={() => navigate("/login")}>
          Acceso militantes
        </Button>
      </Group>

      {events.length > 0 && (
        <Button
          variant="light"
          mb="md"
          onClick={() => calendarAPI.download("public").catch((e) => alert(e.message))}
        >
          Suscribirse a estos eventos (.ics)
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
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
