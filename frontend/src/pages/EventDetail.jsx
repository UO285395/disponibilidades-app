import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Title, Text, Card, Badge, Group, Button, Stack, Anchor, Center, Loader,
} from "@mantine/core";
import {
  IconArrowLeft, IconCalendarEvent, IconClock, IconMapPin, IconExternalLink,
  IconAlertTriangle, IconShare,
} from "@tabler/icons-react";
import { eventsAPI, getToken, getShareUrl } from "../api/api.js";
import GuestEventResponse from "../components/GuestEventResponse.jsx";
import AddToCalendarButton from "../components/AddToCalendarButton.jsx";
import EventAttachments from "../components/EventAttachments.jsx";
import { formatDate, formatTime } from "../utils/datetime.js";
import { notifySuccess, notifyError } from "../utils/notify.js";

const EVENT_TYPE_BADGE = {
  informativo: { label: "Informativo", color: "blue" },
  participativo: { label: "Participativo", color: "teal" },
  disponibilidad: { label: "Disponibilidad", color: "grape" },
};

function InfoRow({ icon, children }) {
  return (
    <Group gap={8} wrap="nowrap">
      {icon}
      <Text size="sm" c="dimmed">{children}</Text>
    </Group>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [error, setError] = useState(null);
  const hasSession = Boolean(getToken());

  useEffect(() => {
    (async () => {
      try {
        const data = await eventsAPI.getPublicDetail(id);
        setEvent(data);
      } catch {
        setError("Evento no encontrado o ya no está disponible.");
      }
    })();
  }, [id]);

  if (error) {
    return (
      <Box p="md" style={{ maxWidth: 600, margin: "48px auto" }}>
        <Center>
          <Stack align="center" gap="sm">
            <IconAlertTriangle size={40} color="var(--mantine-color-red-6)" />
            <Text c="red" fw={600} ta="center">{error}</Text>
            <Button variant="light" leftSection={<IconArrowLeft size={18} />} onClick={() => navigate("/")}>
              Volver a eventos
            </Button>
          </Stack>
        </Center>
      </Box>
    );
  }

  if (!event) {
    return <Center h="60vh"><Loader /></Center>;
  }

  async function shareEvent() {
    // URL del backend con metadatos Open Graph para que el enlace se vea bien.
    const url = getShareUrl(event.id);
    const shareData = {
      title: event.title,
      text: `${event.title} · ${formatDate(event.date)}`,
      url,
    };
    // Web Share API en móvil (nativo del navegador); fallback a copiar al portapapeles.
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        if (e?.name === "AbortError") return; // El usuario canceló.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      notifySuccess("Enlace copiado al portapapeles.");
    } catch {
      notifyError("No se pudo compartir. Copia el enlace de la barra de direcciones.");
    }
  }

  return (
    <Box p="md" pb="xl" style={{ maxWidth: 600, margin: "0 auto" }}>
      <Button
        variant="subtle"
        size="sm"
        mb="sm"
        pl={4}
        leftSection={<IconArrowLeft size={18} />}
        onClick={() => navigate("/")}
      >
        Volver a eventos
      </Button>

      <Card shadow="sm" padding="lg">
        <Group justify="space-between" align="flex-start" mb="sm" wrap="nowrap">
          <Title order={2} style={{ flex: 1 }}>{event.title}</Title>
          <Badge variant="light" color={EVENT_TYPE_BADGE[event.event_type]?.color || "teal"}>
            {EVENT_TYPE_BADGE[event.event_type]?.label || "Participativo"}
          </Badge>
        </Group>

        <Stack gap={6}>
          <InfoRow icon={<IconCalendarEvent size={18} color="var(--mantine-color-dimmed)" />}>
            {formatDate(event.date)}
          </InfoRow>
          {event.start_time && (
            <InfoRow icon={<IconClock size={18} color="var(--mantine-color-dimmed)" />}>
              {formatTime(event.start_time)}
            </InfoRow>
          )}
          {event.location && (
            <InfoRow icon={<IconMapPin size={18} color="var(--mantine-color-dimmed)" />}>
              {event.location}
            </InfoRow>
          )}
        </Stack>

        {event.description && <Text mt="md">{event.description}</Text>}

        <EventAttachments attachments={event.attachments} />

        {event.external_url && (
          <Anchor href={event.external_url} target="_blank" rel="noreferrer" mt="md" style={{ display: "inline-block" }}>
            <Group gap={4} wrap="nowrap">
              <IconExternalLink size={16} />
              <span>Más información</span>
            </Group>
          </Anchor>
        )}

        <Group mt="lg">
          <AddToCalendarButton event={event} size="md" variant="light" />
          <Button
            variant="subtle"
            size="md"
            leftSection={<IconShare size={18} />}
            onClick={shareEvent}
          >
            Compartir
          </Button>
        </Group>
      </Card>

      {hasSession ? (
        <Card shadow="xs" padding="md" mt="md">
          <Text size="sm" c="dimmed" mb="sm">
            Has iniciado sesión como militante. Gestiona tu respuesta y acompañantes desde tu panel.
          </Text>
          <Button onClick={() => navigate("/dashboard")}>Ir a mi panel</Button>
        </Card>
      ) : (
        <Box mt="md">
          <GuestEventResponse eventId={event.id} eventType={event.event_type} date={event.date} />
        </Box>
      )}
    </Box>
  );
}
