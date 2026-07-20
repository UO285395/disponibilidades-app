import { useEffect, useState } from "react";
import {
  Title, Text, Card, SimpleGrid, Group, Badge, Loader, Center, Stack, Button,
  Modal, TextInput, Switch, Textarea, NumberInput,
} from "@mantine/core";
import {
  IconChartBar, IconCoin, IconUsers, IconCalendarEvent, IconPencil,
} from "@tabler/icons-react";
import { adminAPI } from "../api/adminApi.js";
import { formatDate } from "../utils/datetime.js";
import { notifyError, notifySuccess } from "../utils/notify.js";

function StatCard({ icon, label, value, hint }) {
  return (
    <Card withBorder padding="md" radius="md">
      <Group gap="xs" mb={4}>{icon}<Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text></Group>
      <Text fz={28} fw={700}>{value}</Text>
      {hint && <Text size="xs" c="dimmed">{hint}</Text>}
    </Card>
  );
}

// Modal de datos del evento: asistencia real (cuando no todos confirman en la
// app) + actividad económica.
function EventDataModal({ event, onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attendance, setAttendance] = useState("");
  const [hasFee, setHasFee] = useState(false);
  const [feeAmount, setFeeAmount] = useState("");
  const [collected, setCollected] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    adminAPI.getEventFinance(event.event_id)
      .then((f) => {
        if (cancelled) return;
        setAttendance(f.actual_attendance ?? "");
        setHasFee(Boolean(f.has_registration_fee));
        setFeeAmount(f.fee_amount || "");
        setCollected(f.collected_amount || "");
        setNotes(f.notes || "");
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [event.event_id]);

  async function save() {
    try {
      setSaving(true);
      await adminAPI.setEventFinance(event.event_id, {
        has_registration_fee: hasFee,
        fee_amount: feeAmount.trim(),
        collected_amount: collected.trim(),
        actual_attendance: attendance === "" || attendance === null ? null : Number(attendance),
        notes: notes.trim(),
      });
      notifySuccess("Datos del evento guardados");
      onClose(true);
    } catch (e) {
      notifyError(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={() => onClose(false)} title={`Datos · ${event.title}`} centered>
      {loading ? (
        <Center py="lg"><Loader /></Center>
      ) : (
        <Stack gap="md">
          <div>
            <Text size="sm" fw={600}>Asistencia real</Text>
            <Text size="xs" c="dimmed" mb={6}>
              Confirmaciones en la app: <b>{event.estimated_attendance}</b>. Si asistió
              más gente de la que avisó, indica aquí el total real (prevalece en las métricas).
            </Text>
            <NumberInput
              min={0}
              placeholder={`Dejar vacío = usar ${event.estimated_attendance}`}
              value={attendance}
              onChange={(v) => setAttendance(v)}
            />
          </div>

          <div>
            <Text size="sm" fw={600} mb={4}>Actividad económica</Text>
            <Text size="xs" c="dimmed" mb={6}>
              La mayoría de eventos no tienen cuota. Rellena solo cuando aplique.
            </Text>
            <Switch
              label="Tuvo cuota de inscripción"
              checked={hasFee}
              onChange={(e) => setHasFee(e.currentTarget.checked)}
              mb="xs"
            />
            {hasFee && (
              <TextInput
                label="Importe de la cuota (€)"
                placeholder="Ej: 10"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.currentTarget.value)}
                mb="xs"
              />
            )}
            <TextInput
              label="Recaudación total (€)"
              placeholder="Ej: 250"
              value={collected}
              onChange={(e) => setCollected(e.currentTarget.value)}
            />
          </div>

          <Textarea
            label="Notas (opcional)"
            autosize
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => onClose(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} loading={saving}>Guardar</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

export default function AdminMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataEvent, setDataEvent] = useState(null);

  async function reload() {
    try {
      const m = await adminAPI.getMetrics();
      setMetrics(m);
    } catch (e) {
      notifyError(e?.message || "No se pudieron cargar las métricas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  if (loading) return <Center py="xl"><Loader /></Center>;
  if (!metrics) return <Text c="dimmed">No hay datos de métricas.</Text>;

  const p = metrics.participation || {};
  const f = metrics.finance || {};
  const events = metrics.events || [];
  const attendeesReal = p.attendees_real ?? p.attendees_total ?? 0;
  const attendeesEstimated = p.attendees_estimated ?? p.attendees_total ?? 0;

  return (
    <Stack gap="lg">
      <Title order={3}>Métricas del ámbito</Title>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <StatCard icon={<IconCalendarEvent size={18} />} label="Eventos" value={metrics.total_events} />
        <StatCard
          icon={<IconUsers size={18} />}
          label="Asistencia"
          value={attendeesReal}
          hint={attendeesReal !== attendeesEstimated ? `estimada en app: ${attendeesEstimated}` : "estimada por confirmaciones"}
        />
        <StatCard icon={<IconChartBar size={18} />} label="Respuestas Sí/No"
          value={`${p.militant_yes ?? 0}/${p.militant_no ?? 0}`} hint="militancia" />
        <StatCard icon={<IconCoin size={18} />} label="Recaudación"
          value={f.total_collected != null ? `${f.total_collected} €` : "—"}
          hint={`${f.events_with_fee ?? 0} con cuota`} />
      </SimpleGrid>

      <div>
        <Title order={4} mb="xs">Por evento</Title>
        <Text size="sm" c="dimmed" mb="sm">
          Participación de cada evento. Toca «Editar» para registrar la asistencia real
          (si asistió más gente de la que confirmó) y la actividad económica.
        </Text>
        {events.length === 0 ? (
          <Text c="dimmed" size="sm">No hay eventos en tu ámbito.</Text>
        ) : (
          <Stack gap="xs">
            {events.map((ev) => {
              const overridden = ev.actual_attendance != null && ev.actual_attendance !== ev.estimated_attendance;
              return (
                <Card key={ev.event_id} withBorder padding="sm" radius="md">
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <div style={{ minWidth: 0 }}>
                      <Group gap={6} wrap="nowrap">
                        <Text fw={600} truncate>{ev.title}</Text>
                        <Badge variant="light" color={ev.visibility === "public" ? "teal" : "blue"} size="sm">
                          {ev.visibility === "public" ? "Público" : "Interno"}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed">{formatDate(ev.date)}</Text>
                      <Group gap="md" mt={6}>
                        <Text size="sm">
                          Asistencia:{" "}
                          <b>{ev.actual_attendance != null ? ev.actual_attendance : ev.estimated_attendance}</b>
                          {overridden && (
                            <Text component="span" size="xs" c="dimmed"> (app: {ev.estimated_attendance})</Text>
                          )}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Sí {ev.militant_yes} · No {ev.militant_no}
                          {ev.militant_companions > 0 && ` · +${ev.militant_companions} acomp.`}
                          {(ev.guest_yes > 0 || ev.guest_companions > 0) && ` · invitados ${ev.guest_yes + ev.guest_companions}`}
                        </Text>
                        {ev.collected_amount && (
                          <Text size="xs" c="dimmed">Recaudado: {ev.collected_amount} €</Text>
                        )}
                      </Group>
                    </div>
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconPencil size={14} />}
                      onClick={() => setDataEvent(ev)}
                    >
                      Editar
                    </Button>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        )}
      </div>

      {dataEvent && (
        <EventDataModal
          event={dataEvent}
          onClose={(changed) => { setDataEvent(null); if (changed) reload(); }}
        />
      )}
    </Stack>
  );
}
