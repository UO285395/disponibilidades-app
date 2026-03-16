import { useEffect, useState } from "react";
import { Card, Button, TextInput, Title, Textarea, Text } from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { adminAPI } from "../api/adminApi.js";
import { useNavigate } from "react-router-dom";

export default function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(null);
  const [startTime, setStartTime] = useState("");
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

    const isoDate = date instanceof Date ? date.toISOString().slice(0, 10) : date;

    try {
      await adminAPI.createEvent({
        title,
        description: description || null,
        date: isoDate,
        start_time: startTime || null
      });

      setTitle("");
      setDescription("");
      setDate(null);
      setStartTime("");
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
        <DatePicker
          label="Fecha"
          value={date}
          onChange={setDate}
          mb="sm"
          allowLevelChange={false}
          withWithinPortal
          dropdownType="popover"
          inputFormat="DD/MM/YYYY"
          placeholder="Selecciona fecha"
        />
        <TextInput
          type="time"
          label="Hora inicio"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
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

          {/* Resumen de votos Sí / No */}
          <div style={{ marginTop: "10px" }}>
            <b>Resumen de votos:</b>
            <div>Sí: {ev.yes_count ?? 0}</div>
            <div>No: {ev.no_count ?? 0}</div>
          </div>

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
