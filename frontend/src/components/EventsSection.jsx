import { useCallback, useEffect, useRef, useState } from "react";
import {
  Card, Button, TextInput, Title, Text, Group, Modal, NumberInput, Badge,
  Stack, SegmentedControl, Skeleton, Center, Collapse, Anchor, Menu,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCheck, IconX, IconCalendarEvent, IconClock, IconUsers, IconMoodEmpty,
  IconCalendarPlus, IconBell, IconBellOff, IconBellRinging,
} from "@tabler/icons-react";
import { eventsAPI, calendarAPI } from "../api/api.js";
import AddToCalendarButton from "./AddToCalendarButton.jsx";
import EventAttachments from "./EventAttachments.jsx";
import { formatDate, formatTime } from "../utils/datetime.js";
import { notifyError } from "../utils/notify.js";

// Solo hay dos visibilidades reales en el producto: pública e interna.
const VISIBILITY_LABELS = {
  public: { label: "Público", color: "teal" },
  internal: { label: "Interno", color: "blue" },
};

function isNotFoundError(error) {
  return typeof error?.message === "string" && error.message.startsWith("HTTP 404");
}

function normalizeAnswer(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "si" || v === "sí" || v === "yes") return "si";
  if (v === "no") return "no";
  return v;
}

export default function EventsSection() {
  const [events, setEvents] = useState([]);
  // eventId -> "si" | "no" (respuesta actual del usuario; puede cambiarla).
  const [myAnswers, setMyAnswers] = useState(new Map());
  const [companionsByEvent, setCompanionsByEvent] = useState(new Map());
  const [sending, setSending] = useState(null);
  const [savingCompanions, setSavingCompanions] = useState(false);
  const [companionModalOpen, setCompanionModalOpen] = useState(false);
  const [activeCompanionEvent, setActiveCompanionEvent] = useState(null);
  const [companionCountDraft, setCompanionCountDraft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [exporting, setExporting] = useState(false);
  // Evento cuyo "No" está pendiente de justificación (solo se muestra al pulsar No).
  const [noPendingFor, setNoPendingFor] = useState(null);
  const [justificationDraft, setJustificationDraft] = useState("");
  // Evento cuya respuesta ya dada se está reabriendo para cambiarla.
  const [editingFor, setEditingFor] = useState(null);
  // eventId -> true si el usuario activó un recordatorio.
  const [reminders, setReminders] = useState(new Set());
  const mountedRef = useRef(true);
  const loadingRef = useRef(false);
  const visibilityFilterRef = useRef(visibilityFilter);
  visibilityFilterRef.current = visibilityFilter;

  const loadAll = useCallback(async (silent = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!silent) setLoading(true);

    try {
      const filter = visibilityFilterRef.current;
      const apiFilter = filter === "all" ? null : filter;
      const [eventsResult, votesResult, companionsResult, remindersResult] = await Promise.allSettled([
        eventsAPI.list(apiFilter),
        eventsAPI.myResponses(),
        eventsAPI.myCompanions(),
        eventsAPI.myReminders(),
      ]);

      if (!mountedRef.current) return;

      if (eventsResult.status === "fulfilled") {
        setEvents(eventsResult.value);
      } else {
        console.error("Error cargando eventos", eventsResult.reason);
        if (!silent) setEvents([]);
      }

      if (votesResult.status === "fulfilled") {
        const map = new Map();
        (votesResult.value || []).forEach((item) => {
          // Compatibilidad: la API puede devolver ids sueltos o {event_id, answer}.
          if (item && typeof item === "object") {
            const id = Number(item.event_id);
            if (Number.isFinite(id)) map.set(id, normalizeAnswer(item.answer));
          } else {
            const id = Number(item);
            if (Number.isFinite(id)) map.set(id, null);
          }
        });
        setMyAnswers(map);
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

      if (remindersResult && remindersResult.status === "fulfilled") {
        const set = new Set(
          (remindersResult.value || []).map((r) => Number(r.event_id)).filter(Number.isFinite)
        );
        setReminders(set);
      }
    } finally {
      loadingRef.current = false;
      if (mountedRef.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadAll(false);
    return () => {
      mountedRef.current = false;
    };
  }, [loadAll, visibilityFilter]);

  async function exportCalendar() {
    try {
      setExporting(true);
      await calendarAPI.download(visibilityFilter === "all" ? null : visibilityFilter);
    } catch (e) {
      notifyError(e?.message || "No se pudo exportar el calendario");
    } finally {
      setExporting(false);
    }
  }

  // Refresco silencioso al volver a la pestaña/app: evita que un evento
  // borrado por un admin siga apareciendo hasta que el usuario recargue.
  useEffect(() => {
    function handleFocusOrVisible() {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      loadAll(true);
    }

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);
    return () => {
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
    };
  }, [loadAll]);

  function setMyAnswer(eventId, answer) {
    setMyAnswers((prev) => {
      const next = new Map(prev);
      next.set(eventId, answer);
      return next;
    });
  }

  async function respond(id, answer, justification = "") {
    const eventId = Number(id);
    if (sending === eventId) return;

    try {
      setSending(eventId);
      await eventsAPI.respond(eventId, answer, justification);

      setMyAnswer(eventId, answer);
      setNoPendingFor(null);
      setJustificationDraft("");
      setEditingFor(null);

      if (answer === "no") {
        setCompanionsByEvent((prev) => {
          const next = new Map(prev);
          next.set(eventId, 0);
          return next;
        });
      }

      notifications.show({
        color: "teal",
        title: "Respuesta registrada",
        message: answer === "si" ? "Has confirmado tu asistencia." : "Has indicado que no asistirás.",
        icon: <IconCheck size={18} />,
      });
    } catch (e) {
      console.error("Error enviando respuesta", e);

      if (isNotFoundError(e)) {
        setEvents((prev) => prev.filter((ev) => Number(ev.id) !== eventId));
        notifyError("Este evento ya no existe. Puede que haya sido eliminado.");
        return;
      }

      notifyError(e?.message || "Error enviando respuesta");
    } finally {
      setSending(null);
    }
  }

  function startNo(eventId) {
    setNoPendingFor(Number(eventId));
    setJustificationDraft("");
  }

  function cancelNo() {
    setNoPendingFor(null);
    setJustificationDraft("");
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

      if (isNotFoundError(error)) {
        setEvents((prev) => prev.filter((ev) => Number(ev.id) !== eventId));
        setCompanionModalOpen(false);
        setActiveCompanionEvent(null);
        notifyError("Este evento ya no existe. Puede que haya sido eliminado.");
        return;
      }

      notifyError(error?.message || "No se pudieron guardar los acompañantes");
    } finally {
      setSavingCompanions(false);
    }
  }

  async function setReminder(eventId, minutesBefore) {
    try {
      await eventsAPI.setReminder(eventId, minutesBefore, ["push", "email"]);
      setReminders((prev) => new Set(prev).add(Number(eventId)));
      notifications.show({
        color: "teal",
        title: "Recordatorio activado",
        message: "Te avisaremos antes del evento.",
        icon: <IconBellRinging size={18} />,
      });
    } catch (e) {
      notifyError(e?.message || "No se pudo activar el recordatorio");
    }
  }

  async function removeReminder(eventId) {
    try {
      await eventsAPI.deleteReminder(eventId);
      setReminders((prev) => {
        const next = new Set(prev);
        next.delete(Number(eventId));
        return next;
      });
    } catch (e) {
      notifyError(e?.message || "No se pudo quitar el recordatorio");
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Title order={4}>Eventos</Title>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconCalendarPlus size={16} />}
          loading={exporting}
          onClick={exportCalendar}
        >
          Exportar
        </Button>
      </Group>

      <SegmentedControl
        fullWidth
        size="sm"
        value={visibilityFilter}
        onChange={setVisibilityFilter}
        data={[
          { label: "Todos", value: "all" },
          { label: "Públicos", value: "public" },
          { label: "Internos", value: "internal" },
        ]}
      />

      {loading ? (
        <Stack gap="md">
          {[0, 1, 2].map((i) => (
            <Card key={i} withBorder padding="md" radius="md">
              <Skeleton height={20} width="60%" mb="sm" />
              <Skeleton height={14} width="40%" mb="md" />
              <Skeleton height={36} radius="sm" />
            </Card>
          ))}
        </Stack>
      ) : events.length === 0 ? (
        <Center py="xl">
          <Stack align="center" gap="xs">
            <IconMoodEmpty size={40} color="var(--mantine-color-gray-5)" />
            <Text c="dimmed" ta="center">No hay eventos activos por ahora.</Text>
          </Stack>
        </Center>
      ) : (
        <Stack gap="md">
          {events.map((ev) => {
            const eventId = Number(ev.id);
            const answered = myAnswers.has(eventId);
            const currentAnswer = myAnswers.get(eventId);
            const busy = sending === eventId;
            const myCompanions = companionsByEvent.get(eventId) ?? 0;
            const visibilityInfo = VISIBILITY_LABELS[ev.visibility] || VISIBILITY_LABELS.internal;
            const showingNo = noPendingFor === eventId;
            const editing = editingFor === eventId;
            const showButtons = !answered || editing;

            return (
              <Card key={ev.id} withBorder padding="md" radius="md">
                <Group justify="space-between" align="flex-start" mb={6} wrap="nowrap">
                  <Text fw={600} fz="lg" style={{ flex: 1 }}>{ev.title}</Text>
                  <Badge variant="light" size="sm" color={visibilityInfo.color}>
                    {visibilityInfo.label}
                  </Badge>
                </Group>

                <Group gap="lg" mb={ev.description ? 8 : 0}>
                  <Group gap={4} wrap="nowrap">
                    <IconCalendarEvent size={16} color="var(--mantine-color-dimmed)" />
                    <Text size="sm" c="dimmed">{formatDate(ev.date)}</Text>
                  </Group>
                  {ev.start_time && (
                    <Group gap={4} wrap="nowrap">
                      <IconClock size={16} color="var(--mantine-color-dimmed)" />
                      <Text size="sm" c="dimmed">
                        {formatTime(ev.start_time)}
                        {ev.end_time && ` – ${formatTime(ev.end_time)}`}
                      </Text>
                    </Group>
                  )}
                </Group>

                {ev.description && (
                  <Text size="sm" mb="sm">{ev.description}</Text>
                )}

                <EventAttachments attachments={ev.attachments} mt={0} />

                <Group gap="xs" mb="sm" mt="sm">
                  <AddToCalendarButton event={ev} size="xs" variant="subtle" />
                  <Button
                    size="xs"
                    variant="subtle"
                    leftSection={<IconUsers size={16} />}
                    onClick={() => openCompanionModal(ev)}
                  >
                    {myCompanions > 0 ? `Acompañantes (${myCompanions})` : "Acompañantes"}
                  </Button>
                  {reminders.has(eventId) ? (
                    <Button
                      size="xs"
                      variant="subtle"
                      color="teal"
                      leftSection={<IconBell size={16} />}
                      rightSection={<IconBellOff size={14} />}
                      onClick={() => removeReminder(eventId)}
                    >
                      Recordatorio activo
                    </Button>
                  ) : (
                    <Menu position="bottom-start" shadow="md">
                      <Menu.Target>
                        <Button size="xs" variant="subtle" leftSection={<IconBell size={16} />}>
                          Recordármelo
                        </Button>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Label>Avisarme antes del evento</Menu.Label>
                        <Menu.Item onClick={() => setReminder(eventId, 60)}>1 hora antes</Menu.Item>
                        <Menu.Item onClick={() => setReminder(eventId, 180)}>3 horas antes</Menu.Item>
                        <Menu.Item onClick={() => setReminder(eventId, 1440)}>1 día antes</Menu.Item>
                        <Menu.Item onClick={() => setReminder(eventId, 2880)}>2 días antes</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Group>

                {answered && !editing && (
                  <Group justify="space-between" align="center">
                    <Badge
                      variant="light"
                      color={currentAnswer === "no" ? "red" : "teal"}
                      size="lg"
                      leftSection={currentAnswer === "no" ? <IconX size={16} /> : <IconCheck size={16} />}
                    >
                      {currentAnswer === "no" ? "Respondiste: No" : "Respondiste: Sí"}
                    </Badge>
                    <Anchor
                      component="button"
                      type="button"
                      size="sm"
                      onClick={() => { setEditingFor(eventId); setNoPendingFor(null); }}
                    >
                      Cambiar respuesta
                    </Anchor>
                  </Group>
                )}

                {showButtons && (
                  <>
                    <Group grow gap="sm">
                      <Button
                        color="teal"
                        variant={currentAnswer === "si" ? "filled" : "outline"}
                        leftSection={<IconCheck size={18} />}
                        loading={busy && !showingNo}
                        disabled={busy}
                        onClick={() => respond(eventId, "si")}
                      >
                        Sí
                      </Button>
                      <Button
                        color="red"
                        variant={showingNo || currentAnswer === "no" ? "filled" : "outline"}
                        leftSection={<IconX size={18} />}
                        disabled={busy}
                        onClick={() => (showingNo ? cancelNo() : startNo(eventId))}
                      >
                        No
                      </Button>
                    </Group>

                    {editing && (
                      <Anchor
                        component="button"
                        type="button"
                        size="sm"
                        c="dimmed"
                        mt={6}
                        onClick={() => { setEditingFor(null); cancelNo(); }}
                      >
                        Cancelar
                      </Anchor>
                    )}

                    <Collapse in={showingNo}>
                      <Stack gap="xs" mt="sm">
                        <TextInput
                          placeholder="Justificación (opcional)"
                          value={justificationDraft}
                          onChange={(e) => setJustificationDraft(e.currentTarget.value)}
                          disabled={busy}
                        />
                        <Group grow gap="sm">
                          <Button variant="default" onClick={cancelNo} disabled={busy}>
                            Cancelar
                          </Button>
                          <Button
                            color="red"
                            loading={busy}
                            onClick={() => respond(eventId, "no", justificationDraft.trim())}
                          >
                            Confirmar No
                          </Button>
                        </Group>
                      </Stack>
                    </Collapse>
                  </>
                )}
              </Card>
            );
          })}
        </Stack>
      )}

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
    </Stack>
  );
}
