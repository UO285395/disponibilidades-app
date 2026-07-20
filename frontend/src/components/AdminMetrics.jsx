import { useEffect, useState } from "react";
import {
  Title, Text, Card, SimpleGrid, Group, Badge, Loader, Center, Stack, Button,
  Modal, TextInput, Switch, Textarea, NumberInput, Alert,
} from "@mantine/core";
import {
  IconChartBar, IconCoin, IconUsers, IconCalendarEvent, IconPencil,
  IconArchive, IconReceipt2, IconAlertCircle,
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
// app) + actividad económica (ingresos y gastos → rentabilidad).
function EventDataModal({ event, onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [attendance, setAttendance] = useState("");
  const [hasFee, setHasFee] = useState(false);
  const [feeAmount, setFeeAmount] = useState("");
  const [collected, setCollected] = useState("");
  const [expenses, setExpenses] = useState("");
  const [notes, setNotes] = useState("");

  const isClosed = event.status === "closed";

  useEffect(() => {
    let cancelled = false;
    adminAPI.getEventFinance(event.event_id)
      .then((f) => {
        if (cancelled) return;
        setAttendance(f.actual_attendance ?? "");
        setHasFee(Boolean(f.has_registration_fee));
        setFeeAmount(f.fee_amount || "");
        setCollected(f.collected_amount || "");
        setExpenses(f.expenses_amount || "");
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
        expenses_amount: expenses.trim(),
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

  async function closeNow() {
    if (!window.confirm("Cerrar el evento congela su resumen y descarta el detalle de respuestas. Pasará al histórico. ¿Continuar?")) return;
    try {
      setClosing(true);
      // Guardar primero por si hay cambios sin aplicar.
      await adminAPI.setEventFinance(event.event_id, {
        has_registration_fee: hasFee,
        fee_amount: feeAmount.trim(),
        collected_amount: collected.trim(),
        expenses_amount: expenses.trim(),
        actual_attendance: attendance === "" || attendance === null ? null : Number(attendance),
        notes: notes.trim(),
      });
      await adminAPI.closeEvent(event.event_id);
      notifySuccess("Evento cerrado y archivado en el histórico");
      onClose(true);
    } catch (e) {
      notifyError(e?.message || "No se pudo cerrar el evento");
    } finally {
      setClosing(false);
    }
  }

  const busy = saving || closing;

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
              onChange={setAttendance}
              disabled={busy}
            />
          </div>

          <div>
            <Text size="sm" fw={600} mb={4}>Actividad económica</Text>
            <Switch
              label="Tuvo cuota de inscripción"
              checked={hasFee}
              onChange={(e) => setHasFee(e.currentTarget.checked)}
              mb="xs"
              disabled={busy}
            />
            {hasFee && (
              <TextInput
                label="Importe de la cuota (€)"
                placeholder="Ej: 10"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.currentTarget.value)}
                mb="xs"
                disabled={busy}
              />
            )}
            <Group grow>
              <TextInput
                label="Ingresos / recaudación (€)"
                placeholder="Ej: 250"
                value={collected}
                onChange={(e) => setCollected(e.currentTarget.value)}
                disabled={busy}
              />
              <TextInput
                label="Gastos (€)"
                placeholder="Ej: 80"
                value={expenses}
                onChange={(e) => setExpenses(e.currentTarget.value)}
                disabled={busy}
              />
            </Group>
          </div>

          <Textarea
            label="Notas (opcional)"
            autosize
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            disabled={busy}
          />

          <Group justify="space-between">
            {!isClosed && event.status === "pending_close" ? (
              <Button variant="light" color="orange" leftSection={<IconArchive size={16} />} onClick={closeNow} loading={closing} disabled={saving}>
                Cerrar evento
              </Button>
            ) : <span />}
            <Group>
              <Button variant="default" onClick={() => onClose(false)} disabled={busy}>Cancelar</Button>
              {!isClosed && <Button onClick={save} loading={saving} disabled={closing}>Guardar</Button>}
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function money(v) {
  return v === null || v === undefined ? "—" : `${v} €`;
}

function EventRow({ ev, onEdit }) {
  const overridden = ev.actual_attendance != null && ev.actual_attendance !== ev.estimated_attendance;
  return (
    <Card withBorder padding="sm" radius="md">
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
            {(ev.collected_amount || ev.expenses_amount) && (
              <Text size="xs" c="dimmed">
                Ingresos {money(ev.collected_amount)} · Gastos {money(ev.expenses_amount)}
                {ev.profitability != null && (
                  <Text component="span" fw={600} c={ev.profitability >= 0 ? "teal" : "red"}>
                    {" "}· Rent. {ev.profitability} €
                  </Text>
                )}
              </Text>
            )}
          </Group>
        </div>
        <Button size="xs" variant="light" leftSection={<IconPencil size={14} />} onClick={() => onEdit(ev)}>
          Editar
        </Button>
      </Group>
    </Card>
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

  const pending = events.filter((e) => e.status === "pending_close");
  const closed = events.filter((e) => e.status === "closed");
  const upcoming = events.filter((e) => e.status === "upcoming");

  return (
    <Stack gap="lg">
      <Title order={3}>Métricas del ámbito</Title>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <StatCard icon={<IconUsers size={18} />} label="Asistencia" value={attendeesReal}
          hint={attendeesReal !== attendeesEstimated ? `estimada en app: ${attendeesEstimated}` : "por confirmaciones"} />
        <StatCard icon={<IconCoin size={18} />} label="Ingresos"
          value={f.total_collected != null ? `${f.total_collected} €` : "—"}
          hint={`${f.events_with_fee ?? 0} con cuota`} />
        <StatCard icon={<IconReceipt2 size={18} />} label="Gastos"
          value={f.total_expenses != null ? `${f.total_expenses} €` : "—"} />
        <StatCard icon={<IconChartBar size={18} />} label="Rentabilidad"
          value={f.net_profit != null ? `${f.net_profit} €` : "—"}
          hint="ingresos − gastos" />
      </SimpleGrid>

      {pending.length > 0 && (
        <div>
          <Alert color="orange" icon={<IconAlertCircle size={18} />} mb="sm">
            {pending.length} evento(s) pasados pendientes de cerrar. Registra la asistencia
            real, ingresos y gastos; se cerrarán solos pasado el periodo de gracia.
          </Alert>
          <Stack gap="xs">
            {pending.map((ev) => <EventRow key={ev.event_id} ev={ev} onEdit={setDataEvent} />)}
          </Stack>
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <Title order={5} mb="xs">Próximos</Title>
          <Stack gap="xs">
            {upcoming.map((ev) => <EventRow key={ev.event_id} ev={ev} onEdit={setDataEvent} />)}
          </Stack>
        </div>
      )}

      <div>
        <Group gap={6} mb="xs">
          <IconArchive size={18} />
          <Title order={5}>Histórico</Title>
        </Group>
        {closed.length === 0 ? (
          <Text c="dimmed" size="sm">Aún no hay eventos cerrados. Los eventos pasados pasan aquí al cerrarse (se conservan ~24 meses).</Text>
        ) : (
          <Stack gap="xs">
            {closed.map((ev) => <EventRow key={ev.event_id} ev={ev} onEdit={setDataEvent} />)}
          </Stack>
        )}
      </div>

      {events.length === 0 && (
        <Center py="md">
          <Group gap="xs"><IconCalendarEvent size={20} /><Text c="dimmed">No hay eventos en tu ámbito.</Text></Group>
        </Center>
      )}

      {dataEvent && (
        <EventDataModal
          event={dataEvent}
          onClose={(changed) => { setDataEvent(null); if (changed) reload(); }}
        />
      )}
    </Stack>
  );
}
