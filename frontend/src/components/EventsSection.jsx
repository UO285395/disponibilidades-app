import { useEffect, useState } from "react";
import { Card, Button, TextInput, Title, Text } from "@mantine/core";
import { eventsAPI } from "../api/api.js";

export default function EventsSection() {
  const [events, setEvents] = useState([]);
  const [votedEvents, setVotedEvents] = useState(new Set());
  const [sending, setSending] = useState(null); // id del evento en envío

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await eventsAPI.list();
        if (!cancelled) setEvents(data);
      } catch (e) {
        console.error("Error cargando eventos", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function respond(id, answer) {
    if (votedEvents.has(id) || sending === id) return;

    const justification =
      document.getElementById("just_" + id)?.value.trim() || "";

    try {
      setSending(id);

      await eventsAPI.respond(id, answer, justification);

      // marcar evento como votado
      setVotedEvents((prev) => new Set(prev).add(id));
    } catch (e) {
      console.error("Error enviando respuesta", e);
      alert("Error enviando respuesta");
    } finally {
      setSending(null);
    }
  }

  return (
    <Card shadow="md" p="lg" radius="md">
      <Title order={4} mb="md">
        Eventos
      </Title>

      {events.length === 0 && (
        <Text size="sm" c="dimmed">
          No hay eventos activos.
        </Text>
      )}

      {events.map((ev) => {
        const voted = votedEvents.has(ev.id);
        const disabled = voted || sending === ev.id;

        return (
          <Card key={ev.id} shadow="sm" p="md" radius="md" mb="md">
            <b>{ev.title}</b> — {ev.date}

            {ev.description && (
              <Text size="sm" mt="xs">
                {ev.description}
              </Text>
            )}

            {voted && (
              <Text size="sm" c="green" mt="sm">
                ✔ Respuesta enviada
              </Text>
            )}

            <Button
              mt="sm"
              mr="sm"
              disabled={disabled}
              onClick={() => respond(ev.id, "si")}
            >
              Sí
            </Button>

            <TextInput
              id={`just_${ev.id}`}
              placeholder="Justificación (si respondes NO)"
              mt="sm"
              disabled={disabled}
            />

            <Button
              mt="sm"
              color="red"
              disabled={disabled}
              onClick={() => respond(ev.id, "no")}
            >
              No
            </Button>
          </Card>
        );
      })}
    </Card>
  );
}
