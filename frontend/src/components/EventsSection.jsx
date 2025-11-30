import { useEffect, useState } from "react";
import { Card, Button, TextInput, Title, Text } from "@mantine/core";
import { eventsAPI } from "../api/api.js";

export default function EventsSection() {
  const [events, setEvents] = useState([]);

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
    const justification =
      document.getElementById("just_" + id)?.value.trim() || "";
    try {
      await eventsAPI.respond(id, answer, justification);
      alert("Respuesta enviada");
    } catch (e) {
      console.error("Error enviando respuesta", e);
      alert("Error enviando respuesta");
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

      {events.map((ev) => (
        <Card key={ev.id} shadow="sm" p="md" radius="md" mb="md">
          <b>{ev.title}</b> — {ev.date}
          {ev.description && (
            <Text size="sm" mt="xs">
              {ev.description}
            </Text>
          )}

          <Button mt="sm" mr="sm" onClick={() => respond(ev.id, "si")}>
            Sí
          </Button>

          <TextInput
            id={`just_${ev.id}`}
            placeholder="Justificación si respondes NO"
            mt="sm"
          />
          
          <Button mt="sm" color="red" onClick={() => respond(ev.id, "no")}>
            No
          </Button>
        </Card>
      ))}
    </Card>
  );
}
