import { useEffect, useState } from "react";
import { Card, Button, TextInput, Title, Text, Badge } from "@mantine/core";
import { eventsAPI } from "../api/api.js";

export default function EventsSection() {
  const [events, setEvents] = useState([]);
  const [votedEvents, setVotedEvents] = useState(new Set());
  const [sending, setSending] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [eventsResult, votesResult] = await Promise.allSettled([
          eventsAPI.list(),
          eventsAPI.myResponses(),
        ]);

        if (cancelled) return;

        if (eventsResult.status === "fulfilled") {
          setEvents(eventsResult.value);
        } else {
          console.error("Error cargando eventos", eventsResult.reason);
          setEvents([]);
        }

        if (votesResult.status === "fulfilled") {
          const normalized = votesResult.value
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id));
          setVotedEvents(new Set(normalized));
        } else {
          console.error("Error cargando votos del usuario", votesResult.reason);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function respond(id, answer) {
    const eventId = Number(id);
    if (votedEvents.has(eventId) || sending === eventId) return;

    const justification = document.getElementById("just_" + eventId)?.value.trim() || "";

    try {
      setSending(eventId);
      await eventsAPI.respond(eventId, answer, justification);

      setVotedEvents((prev) => {
        const next = new Set(prev);
        next.add(eventId);
        return next;
      });
    } catch (e) {
      console.error("Error enviando respuesta", e);

      const message = e?.message || "";
      if (message.includes("Ya has votado en este evento")) {
        setVotedEvents((prev) => {
          const next = new Set(prev);
          next.add(eventId);
          return next;
        });
        alert("Ya has votado en este evento.");
      } else if (message.includes("ha expirado")) {
        alert("Este evento ha expirado. Ya no puedes votar.");
      } else {
        alert(message || "Error enviando respuesta");
      }
    } finally {
      setSending(null);
    }
  }

  if (loading) {
    return (
      <Card shadow="md" p="lg">
        <Text size="sm" c="dimmed">
          Cargando eventos…
        </Text>
      </Card>
    );
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
        const eventId = Number(ev.id);
        const voted = votedEvents.has(eventId);
        const isExpired = ev.is_expired === true;
        const disabled = voted || sending === eventId || isExpired;

        return (
          <Card key={ev.id} shadow="sm" p="md" radius="md" mb="md">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <Text fw={700}>{ev.title}</Text>
              {isExpired && <Badge color="red">Expirado</Badge>}
            </div>

            {/* Fecha normal + hora en negrita */}
            <Text size="sm" c="dimmed">
              {ev.date} ·{" "}
              <Text component="span" fw={700} size="md">
                {ev.start_time}
                {ev.end_time && ` – ${ev.end_time}`}
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

            {isExpired && !voted && (
              <Text size="sm" c="orange" mt="sm" fw={500}>
                ⏰ Este evento ha expirado. Ya no puedes votar.
              </Text>
            )}

            <Button
              mt="sm"
              mr="sm"
              disabled={disabled}
              onClick={() => respond(eventId, "si")}
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
              onClick={() => respond(eventId, "no")}
            >
              No
            </Button>
          </Card>
        );
      })}
    </Card>
  );
}
