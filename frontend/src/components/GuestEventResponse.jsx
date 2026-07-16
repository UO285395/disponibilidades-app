import { useState } from "react";
import { Card, Title, Text, TextInput, NumberInput, Button, Group, Stack } from "@mantine/core";
import { eventsAPI } from "../api/api.js";

export default function GuestEventResponse({ eventId }) {
  const [guestName, setGuestName] = useState("");
  const [companions, setCompanions] = useState(0);
  const [sending, setSending] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  async function respond(answer) {
    if (sending) return;
    setError(null);

    try {
      setSending(answer);
      await eventsAPI.respondGuest(eventId, { guestName, answer, companions });
      setDone(answer);
    } catch (e) {
      setError(e?.message || "No se pudo enviar la respuesta. Inténtalo de nuevo.");
    } finally {
      setSending(null);
    }
  }

  if (done) {
    return (
      <Card shadow="sm" p="md" radius="md" mt="md">
        <Text c="green" fw={600}>
          {done === "si" ? "¡Gracias por confirmar tu asistencia!" : "Gracias por responder."}
        </Text>
      </Card>
    );
  }

  return (
    <Card shadow="sm" p="md" radius="md" mt="md">
      <Title order={5} mb="xs">
        ¿Vas a asistir?
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        No hace falta cuenta ni email, solo tu nombre si quieres que lo sepamos.
      </Text>

      <Stack gap="sm">
        <TextInput
          label="Tu nombre (opcional)"
          placeholder="Nombre y apellidos"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
        />

        <NumberInput
          label="Acompañantes"
          min={0}
          max={20}
          value={companions}
          onChange={(value) => setCompanions(Number(value || 0))}
        />

        {error && <Text c="red" size="sm">{error}</Text>}

        <Group grow>
          <Button color="teal" loading={sending === "si"} disabled={!!sending} onClick={() => respond("si")}>
            Sí, voy
          </Button>
          <Button color="red" variant="outline" loading={sending === "no"} disabled={!!sending} onClick={() => respond("no")}>
            No puedo
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
