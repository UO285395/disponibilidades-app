import { useEffect, useState } from "react";
import { Card, Button, TextInput, Title } from "@mantine/core";
import { eventsAPI } from "../api/api";

export default function EventsSection() {
  const [events, setEvents] = useState([]);

  // Cargar solo una vez
  useEffect(() => {
    (async () => {
      const data = await eventsAPI.list();
      setEvents(data);
    })();
  }, []);

  async function respond(id, answer) {
    const justification = document.getElementById("just_" + id)?.value || "";
    await eventsAPI.respond(id, answer, justification);
    alert("Respuesta enviada");
  }

  return (
    <Card shadow="md" p="lg" radius="md">
      <Title order={4} mb="md">Eventos</Title>

      {events.map((ev) => (
        <Card key={ev.id} shadow="sm" p="md" radius="md" mb="md">
          <b>{ev.title}</b> — {ev.date}
          <br />

          <Button mt="sm" mr="sm" onClick={() => respond(ev.id, "yes")}>
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
