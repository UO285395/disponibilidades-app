import { useEffect, useState } from "react";
import { Card, Button, TextInput, Title, Text } from "@mantine/core";
import { eventsAPI } from "../api/api.js";

export default function EventsSection() {
  const [events, setEvents] = useState([]);
  const [votedEvents, setVotedEvents] = useState(new Set());
  const [sending, setSending] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) Cargar eventos SIEMPRE
      try {
        const eventsData = await eventsAPI.list();
        if (!cancelled) setEvents(eventsData);
      } catch (e) {
        console.error("Error cargando eventos", e);
        return;
      }

      // 2) Intentar cargar eventos ya votados (si falla, no rompe la vista)
      try {
        const votedIds = await eventsAPI.myResponses();
        if (!cancelled) setVotedEvents(new Set(votedIds));
      } catch (e) {
        console.warn(
          "No se pudo cargar /events/my-responses (no bloquea el listado de eventos):",
          e
        );
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

      // marcar como votado
      setVotedEvents((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
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
            <Text fw={700}>{ev.title}</Text>

            {/* Fecha + hora (hora en negrita y un poco más grande) */}
            <Text size="sm" c="dimmed">
              {ev.date} ·{" "}
              <Text component="span" fw={700} size="md">
                {ev.start_time || ""}
                {ev.end_time ? ` – ${ev.end_time}` : ""}
              </Text>
            </Text>

            {ev.description && (
              <Text size="sm" mt="xs">
                {ev.description}
              </Text>
            )}

            {voted && (
              <Text size="sm" c="green" mt="sm">
                ✔ Ya has votado en este evento
              </Text>
            )}

            <Button
              mt="sm"
              mr="sm"
              disabled={disabled}
              onClick={() => respond(ev.id, "yes")}
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
