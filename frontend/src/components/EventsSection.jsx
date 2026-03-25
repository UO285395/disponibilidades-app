import { useEffect, useState } from "react";
import { Card, Button, TextInput, Title, Text, Group, Modal, NumberInput } from "@mantine/core";
import { eventsAPI } from "../api/api.js";

export default function EventsSection() {
  const [events, setEvents] = useState([]);
  const [votedEvents, setVotedEvents] = useState(new Set());
  const [companionsByEvent, setCompanionsByEvent] = useState(new Map());
  const [sending, setSending] = useState(null);
  const [savingCompanions, setSavingCompanions] = useState(false);
  const [companionModalOpen, setCompanionModalOpen] = useState(false);
  const [activeCompanionEvent, setActiveCompanionEvent] = useState(null);
  const [companionCountDraft, setCompanionCountDraft] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [eventsResult, votesResult, companionsResult] = await Promise.allSettled([
          eventsAPI.list(),
          eventsAPI.myResponses(),
          eventsAPI.myCompanions(),
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

        if (companionsResult && companionsResult.status === "fulfilled") {
          const map = new Map();
          companionsResult.value.forEach((item) => {
            const eventId = Number(item.event_id);
            const count = Number(item.count || 0);
            if (Number.isFinite(eventId)) {
              map.set(eventId, count);
            }
          });
          setCompanionsByEvent(map);
        } else if (companionsResult && companionsResult.status === "rejected") {
          console.error("Error cargando acompañantes", companionsResult.reason);
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

      if (answer === "no") {
        setCompanionsByEvent((prev) => {
          const next = new Map(prev);
          next.set(eventId, 0);
          return next;
        });
      }
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
      } else {
        alert(message || "Error enviando respuesta");
      }
    } finally {
      setSending(null);
    }
  }

  function openCompanionModal(event) {
    const eventId = Number(event.id);
    setActiveCompanionEvent(event);
    setCompanionCountDraft(companionsByEvent.get(eventId) ?? 0);
    setCompanionModalOpen(true);
  }

  async function saveCompanions() {
    if (!activeCompanionEvent) return;

    const eventId = Number(activeCompanionEvent.id);
    const count = Number(companionCountDraft || 0);

    try {
      setSavingCompanions(true);
      await eventsAPI.updateMyCompanions(eventId, count);
      setCompanionsByEvent((prev) => {
        const next = new Map(prev);
        next.set(eventId, count);
        return next;
      });
      setCompanionModalOpen(false);
      setActiveCompanionEvent(null);
    } catch (error) {
      console.error("Error guardando acompañantes", error);
      alert(error?.message || "No se pudieron guardar los acompañantes");
    } finally {
      setSavingCompanions(false);
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
        const disabled = voted || sending === eventId;
        const myCompanions = companionsByEvent.get(eventId) ?? 0;
        const companionsButtonLabel = myCompanions > 0 ? `Acompañantes (${myCompanions})` : "Acompañantes";

        return (
          <Card key={ev.id} shadow="sm" p="md" radius="md" mb="md">
            <Group justify="space-between" align="flex-start" mb="xs">
              <Text fw={700}>{ev.title}</Text>
              <Button size="xs" variant="outline" onClick={() => openCompanionModal(ev)}>
                {companionsButtonLabel}
              </Button>
            </Group>

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

            <Button
              mt="sm"
              mr="sm"
              fullWidth
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
              fullWidth
              disabled={disabled}
              onClick={() => respond(eventId, "no")}
            >
              No
            </Button>
          </Card>
        );
      })}

      <Modal
        opened={companionModalOpen}
        onClose={() => {
          setCompanionModalOpen(false);
          setActiveCompanionEvent(null);
        }}
        title={activeCompanionEvent ? `Acompañantes · ${activeCompanionEvent.title}` : "Acompañantes"}
      >
        <Text size="sm" c="dimmed" mb="sm">
          Define cuántos acompañantes irán contigo a este evento.
        </Text>
        <NumberInput
          label="Cantidad de acompañantes"
          min={0}
          max={20}
          value={companionCountDraft}
          onChange={(value) => setCompanionCountDraft(Number(value || 0))}
        />
        <Group mt="md" justify="flex-end">
          <Button
            variant="default"
            onClick={() => {
              setCompanionModalOpen(false);
              setActiveCompanionEvent(null);
            }}
            disabled={savingCompanions}
          >
            Cancelar
          </Button>
          <Button onClick={saveCompanions} loading={savingCompanions}>
            Guardar
          </Button>
        </Group>
      </Modal>
    </Card>
  );
}
