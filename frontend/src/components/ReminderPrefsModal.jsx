import { useEffect, useState } from "react";
import { Modal, TextInput, Switch, Button, Group, Stack, Text } from "@mantine/core";
import { userAPI } from "../api/api.js";
import { notifyError, notifySuccess } from "../utils/notify.js";

// Preferencias de recordatorio del propio usuario: correo opcional (opt-in) y
// aviso semanal de disponibilidad. Nada es invasivo: todo lo activa el usuario.
export default function ReminderPrefsModal({ opened, onClose }) {
  const [email, setEmail] = useState("");
  const [availabilityOptIn, setAvailabilityOptIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setLoading(true);
    userAPI.getReminderPrefs()
      .then((p) => {
        setEmail(p.reminder_email || "");
        setAvailabilityOptIn(Boolean(p.availability_reminder_opt_in));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [opened]);

  async function save() {
    try {
      setSaving(true);
      await userAPI.updateReminderPrefs({
        reminder_email: email.trim(),
        availability_reminder_opt_in: availabilityOptIn,
      });
      notifySuccess("Preferencias guardadas");
      onClose();
    } catch (e) {
      notifyError(e?.message || "No se pudieron guardar las preferencias");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Recordatorios" centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Configura cómo quieres recibir avisos. Todo es opcional: solo recibirás
          recordatorios que actives tú.
        </Text>
        <TextInput
          label="Correo para recordatorios (opcional)"
          description="Si lo indicas, además de la notificación en la app recibirás un correo."
          placeholder="tucorreo@ejemplo.com"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          disabled={loading}
        />
        <Switch
          label="Recordarme marcar mi disponibilidad cada semana"
          checked={availabilityOptIn}
          onChange={(e) => setAvailabilityOptIn(e.currentTarget.checked)}
          disabled={loading}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} loading={saving}>Guardar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
