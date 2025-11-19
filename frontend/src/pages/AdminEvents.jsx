import { useEffect, useState } from "react";
import { Card, Button, TextInput, Title, Textarea, Text } from "@mantine/core";
import { adminAPI } from "../api/adminApi.js";
import { useNavigate } from "react-router-dom";

export default function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await adminAPI.listEvents();
        if (!cancelled) setEvents(data);
      } catch (e) {
        console.error("Error cargando eventos", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function reload() {
    try {
      const data = await adminAPI.listEvents();
      setEvents(data);
    } catch (e) {
      console.error("Error recargando eventos", e);
    }
  }

  async function createEvent() {
    if (!title || !date) return;

    try {
      await adminAPI.createEvent({
        title,
        description: description || null,
        date,
        start_time: null,
        end_time: null
      });

      setTitle("");
      setDescription("");
      setDate("");
      await reload();
    } catch (e) {
      console.error("Error creando evento", e);
      alert("Error creando evento");
    }
  }

  async function deleteEvent(id) {
    try {
      await adminAPI.deleteEvent(id);
      await reload();
    } catch (e) {
      console.error("Error eliminando evento", e);
      alert("Error eliminando evento");
    }
  }

  return (
    <>
      <Title order={3} mb="md">
        Crear evento
      </Title>

      <Card shadow="sm" p="md" mb="xl">
        <TextInput
          label="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          mb="sm"
        />
        <Textarea
          label="Descripción"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          mb="sm"
        />
        <TextInput
          type="date"
          label="Fecha"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          mb="sm"
        />

        <Button onClick={createEvent}>Crear evento</Button>
      </Card>

      <Title order={3} mb="md">
        Eventos existentes
      </Title>

      {events.length === 0 && (
        <Text size="sm" c="dimmed">
          No hay eventos.
        </Text>
      )}

      {events.map((ev) => (
        <Card key={ev.id} shadow="sm" p="md" mb="md">
          <b>{ev.title}</b> — {ev.date}
          {ev.description && <p>{ev.description}</p>}

          <Button
            mt="sm"
            onClick={() => navigate(`/admin/event/${ev.id}`)}
          >
            Ver respuestas
          </Button>

          <Button
            mt="sm"
            ml="sm"
            color="red"
            onClick={() => deleteEvent(ev.id)}
          >
            Eliminar
          </Button>
        </Card>
      ))}
    </>
  );
}
