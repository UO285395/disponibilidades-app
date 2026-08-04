import { useState } from "react";
import { Card, Title, Text, TextInput, NumberInput, Button, Group, Stack, Anchor } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { eventsAPI } from "../api/api.js";

export default function GuestEventResponse({ eventId }) {
  const [guestName, setGuestName] = useState("");
  const [companions, setCompanions] = useState(0);
  const [sending, setSending] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  async function respond() {
    if (sending) return;
    setError(null);

    try {
      setSending(true);
      await eventsAPI.respondGuest(eventId, { guestName, answer: "si", companions });
      setDone(true);
    } catch (e) {
      setError(e?.message || "No se pudo enviar la respuesta. Inténtalo de nuevo.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <Card shadow="sm" p="md" radius="md" mt="md">
        <Group gap="xs" mb={4}>
          <IconCheck size={20} color="var(--mantine-color-teal-6)" />
          <Text c="teal" fw={600}>
            ¡Gracias por confirmar tu asistencia!
          </Text>
        </Group>
        <Anchor component="button" type="button" size="sm" onClick={() => setDone(false)}>
          Cambiar mi respuesta
        </Anchor>
      </Card>
    );
  }

  return (
    <Card shadow="sm" p="md" radius="md" mt="md">
      <Title order={5} mb="xs">
        Confirma tu asistencia
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

        <Button color="teal" loading={sending} disabled={sending} onClick={respond}>
          Sí, voy
        </Button>
      </Stack>
    </Card>
  );
}
