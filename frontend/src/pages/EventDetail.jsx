import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Title, Text, Card, Badge, Group, Button } from "@mantine/core";
import { eventsAPI, getToken } from "../api/api.js";
import GuestEventResponse from "../components/GuestEventResponse.jsx";

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [error, setError] = useState(null);
  const hasSession = Boolean(getToken());

  useEffect(() => {
    (async () => {
      try {
        const data = await eventsAPI.getPublicDetail(id);
        setEvent(data);
      } catch (e) {
        setError("Evento no encontrado o ya no está disponible.");
      }
    })();
  }, [id]);

  if (error) {
    return (
      <Box p="xl" style={{ maxWidth: 600, margin: "60px auto", textAlign: "center" }}>
        <Text c="red" fw={600}>{error}</Text>
        <Button variant="subtle" mt="md" onClick={() => navigate("/")}>
          Volver a eventos
        </Button>
      </Box>
    );
  }

  if (!event) {
    return (
      <Box p="xl" style={{ textAlign: "center", marginTop: 80 }}>
        <Text c="dimmed">Cargando evento…</Text>
      </Box>
    );
  }

  return (
    <Box p="lg" style={{ maxWidth: 600, margin: "0 auto" }}>
      <Button variant="subtle" mb="md" onClick={() => navigate("/")}>
        ← Volver a eventos
      </Button>

      <Card shadow="md" p="lg" radius="md">
        <Group justify="space-between" align="flex-start" mb="xs">
          <Title order={3}>{event.title}</Title>
          <Badge color={event.visibility === "public" ? "teal" : "gray"}>
            {event.visibility === "public" ? "Público" : "Interno"}
          </Badge>
        </Group>

        <Text size="sm" c="dimmed">
          {event.date}
          {event.start_time && ` · ${event.start_time}`}
          {event.location && ` · ${event.location}`}
        </Text>

        {event.description && <Text mt="md">{event.description}</Text>}

        {event.external_url && (
          <Text mt="sm">
            <a href={event.external_url} target="_blank" rel="noreferrer">
              Más información
            </a>
          </Text>
        )}
      </Card>

      {hasSession ? (
        <Card shadow="sm" p="md" radius="md" mt="md">
          <Text size="sm" c="dimmed">
            Has iniciado sesión como militante. Gestiona tu respuesta y acompañantes desde tu panel.
          </Text>
          <Button mt="sm" onClick={() => navigate("/dashboard")}>
            Ir a mi panel
          </Button>
        </Card>
      ) : (
        <GuestEventResponse eventId={event.id} />
      )}
    </Box>
  );
}
