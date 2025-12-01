import { useEffect, useState } from "react";
import { Card, Button, TextInput, Title, Textarea, Text } from "@mantine/core";
import { adminAPI } from "../api/adminApi.js";
import { useNavigate } from "react-router-dom";

// ---- Función para resumir votos SIN duplicar usuario ----
function contarSiNo(answers = []) {
  const unique = new Map();

  for (const a of answers) {
    if (!unique.has(a.user_id)) {
      unique.set(a.user_id, a.answer); // "yes" o "no"
    }
  }

  let si = 0, no = 0;

  for (const v of unique.values()) {
    if (v === "yes" || v==="si") si++;
    else if (v === "no") no++;
  }

  return { si, no };
}

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

          {/* Resumen de votos Sí / No */}
          {ev.answers && ev.answers.length > 0 && (
            <div style={{ marginTop: "10px" }}>
              <b>Resumen de votos:</b>
              {(() => {
                const { si, no } = contarSiNo(ev.answers);
                return (
                  <>
                    <div>Sí: {si}</div>
                    <div>No: {no}</div>
                  </>
                );
              })()}
            </div>
          )}

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
