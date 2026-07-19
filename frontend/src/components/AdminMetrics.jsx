import { useEffect, useState } from "react";
import {
  Title, Text, Card, SimpleGrid, Group, Badge, Loader, Center, Stack, Button,
  Modal, TextInput, Switch, Textarea,
} from "@mantine/core";
import { IconChartBar, IconCoin, IconUsers, IconCalendarEvent } from "@tabler/icons-react";
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

function FinanceModal({ event, onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasFee, setHasFee] = useState(false);
  const [feeAmount, setFeeAmount] = useState("");
  const [collected, setCollected] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    adminAPI.getEventFinance(event.id)
      .then((f) => {
        if (cancelled) return;
        setHasFee(Boolean(f.has_registration_fee));
        setFeeAmount(f.fee_amount || "");
        setCollected(f.collected_amount || "");
        setNotes(f.notes || "");
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [event.id]);

  async function save() {
    try {
      setSaving(true);
      await adminAPI.setEventFinance(event.id, {
        has_registration_fee: hasFee,
        fee_amount: feeAmount.trim(),
        collected_amount: collected.trim(),
        notes: notes.trim(),
      });
      notifySuccess("Actividad económica guardada");
      onClose(true);
    } catch (e) {
      notifyError(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={() => onClose(false)} title={`Economía · ${event.title}`} centered>
      {loading ? (
        <Center py="lg"><Loader /></Center>
      ) : (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            La mayoría de eventos no tienen cuota. Registra aquí los importes solo
            cuando aplique; alimentan las métricas del ámbito.
          </Text>
          <Switch
            label="Tuvo cuota de inscripción"
            checked={hasFee}
            onChange={(e) => setHasFee(e.currentTarget.checked)}
          />
          {hasFee && (
            <TextInput
              label="Importe de la cuota (€)"
              placeholder="Ej: 10"
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.currentTarget.value)}
            />
          )}
          <TextInput
            label="Recaudación total (€)"
            placeholder="Ej: 250"
            value={collected}
            onChange={(e) => setCollected(e.currentTarget.value)}
          />
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
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [financeEvent, setFinanceEvent] = useState(null);

  async function reload() {
    try {
      const [m, evs] = await Promise.all([adminAPI.getMetrics(), adminAPI.listEvents()]);
      setMetrics(m);
      setEvents(evs || []);
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

  return (
    <Stack gap="lg">
      <Title order={3}>Métricas del ámbito</Title>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <StatCard icon={<IconCalendarEvent size={18} />} label="Eventos" value={metrics.total_events} />
        <StatCard icon={<IconUsers size={18} />} label="Asistencia" value={p.attendees_total ?? 0}
          hint={`${p.militant_yes ?? 0} militantes · ${p.guest_yes ?? 0} visitantes`} />
        <StatCard icon={<IconChartBar size={18} />} label="Respuestas Sí/No"
          value={`${p.militant_yes ?? 0}/${p.militant_no ?? 0}`} hint="militancia" />
        <StatCard icon={<IconCoin size={18} />} label="Recaudación"
          value={f.total_collected != null ? `${f.total_collected} €` : "—"}
          hint={`${f.events_with_fee ?? 0} con cuota`} />
      </SimpleGrid>

      <div>
        <Title order={4} mb="sm">Actividad económica por evento</Title>
        <Text size="sm" c="dimmed" mb="sm">
          Registra recaudación y cuota de los eventos que la tuvieron.
        </Text>
        {events.length === 0 ? (
          <Text c="dimmed" size="sm">No hay eventos.</Text>
        ) : (
          <Stack gap="xs">
            {events.map((ev) => (
              <Card key={ev.id} withBorder padding="sm" radius="md">
                <Group justify="space-between" wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Text fw={600} truncate>{ev.title}</Text>
                    <Text size="xs" c="dimmed">{formatDate(ev.date)}</Text>
                  </div>
                  <Group gap="xs" wrap="nowrap">
                    <Badge variant="light" color={ev.visibility === "public" ? "teal" : "blue"} size="sm">
                      {ev.visibility === "public" ? "Público" : "Interno"}
                    </Badge>
                    <Button size="xs" variant="light" leftSection={<IconCoin size={14} />}
                      onClick={() => setFinanceEvent(ev)}>
                      Economía
                    </Button>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </div>

      {financeEvent && (
        <FinanceModal
          event={financeEvent}
          onClose={(changed) => { setFinanceEvent(null); if (changed) reload(); }}
        />
      )}
    </Stack>
  );
}
