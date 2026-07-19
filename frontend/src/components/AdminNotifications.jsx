import { useEffect, useMemo, useState } from "react";
import { adminAPI } from "../api/adminApi.js";
import OrgUnitSelect from "./OrgUnitSelect.jsx";
import { Card, Title, Text, TextInput, Textarea, Button, Group, Select, MultiSelect, Alert } from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";
import { notifyError, notifySuccess } from "../utils/notify.js";

const CONFIG_ERROR_REASONS = [
  "missing_fcm_key", "missing_fcm_config", "missing_firebase_project_id",
  "invalid_fcm_service_account", "fcm_auth_error", "missing_google_auth_dependency",
];

// Traduce el motivo técnico que devuelve el backend a un mensaje claro.
function describeReason(reason) {
  switch (reason) {
    case "no_tokens":
      return "Nadie del destino tiene la app instalada con notificaciones activadas, así que no se ha enviado ninguna.";
    case "no_target_users":
      return "No hay usuarios en el destino seleccionado.";
    case "missing_fcm_config":
    case "missing_fcm_key":
    case "missing_firebase_project_id":
    case "invalid_fcm_service_account":
    case "missing_google_auth_dependency":
      return "Falta configurar Firebase/FCM en el servidor (Railway). Sin esa configuración no se pueden enviar notificaciones push.";
    case "fcm_auth_error":
      return "El servidor no ha podido autenticarse con Firebase. Revisa la cuenta de servicio en Railway.";
    default:
      return null;
  }
}

export default function AdminNotifications() {
  const [users, setUsers] = useState([]);
  const [scope, setScope] = useState("colectivo");
  const [orgUnitId, setOrgUnitId] = useState(null);
  const [groupTag, setGroupTag] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminAPI.listUsers();
        setUsers(data || []);
      } catch (e) {
        console.error("Error cargando usuarios para notificaciones", e);
      }
    })();
  }, []);

  const userOptions = useMemo(
    () =>
      users.map((u) => ({
        value: String(u.id),
        label: `${u.full_name} (${u.email})`,
      })),
    [users]
  );

  // Etiquetas realmente existentes entre los usuarios de mi ámbito.
  const tagOptions = useMemo(() => {
    const tags = new Set();
    for (const u of users) {
      const list = Array.isArray(u.group_tags)
        ? u.group_tags
        : String(u.group_tag || "").split(",").map((t) => t.trim()).filter(Boolean);
      list.forEach((t) => tags.add(t));
    }
    return [...tags].sort().map((t) => ({ value: t, label: t }));
  }, [users]);

  async function handleSend() {
    if (!title.trim() || !body.trim()) {
      notifyError("Título y mensaje son obligatorios");
      return;
    }

    const payload = {
      scope,
      title: title.trim(),
      body: body.trim(),
      org_unit_id: scope === "colectivo" && orgUnitId ? Number(orgUnitId) : null,
      user_ids: scope === "users" ? selectedUsers.map((id) => Number(id)) : null,
      group_tag: scope === "tag" ? groupTag : null,
    };

    if (scope === "colectivo" && !payload.org_unit_id) {
      notifyError("Selecciona la estructura destino");
      return;
    }
    if (scope === "users" && payload.user_ids.length === 0) {
      notifyError("Selecciona al menos un usuario");
      return;
    }
    if (scope === "tag" && !payload.group_tag) {
      notifyError("Selecciona la etiqueta destino");
      return;
    }

    try {
      setSending(true);
      const r = await adminAPI.sendNotification(payload);
      setResult(r);
      if (CONFIG_ERROR_REASONS.includes(r?.reason)) {
        notifyError(describeReason(r?.reason) || r?.message || "Falta configurar Firebase/FCM en el servidor.");
      } else if ((r?.sent ?? 0) > 0) {
        notifySuccess(`Notificación enviada a ${r.sent} dispositivo(s).`);
      }
    } catch (e) {
      console.error("Error enviando notificación", e);
      notifyError(e?.message || "Error enviando notificación");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Title order={3} mb="md">Notificaciones móviles</Title>
      <Text size="sm" c="dimmed" mb="lg">
        Envío manual de notificaciones push por estructura, usuario o etiqueta.
        Solo puedes notificar dentro de tu ámbito: tu propia estructura y las
        que dependen de ella.
      </Text>

      <Card shadow="sm" p="md" withBorder>
        <Select
          label="Alcance"
          value={scope}
          onChange={(v) => setScope(v || "colectivo")}
          data={[
            { value: "colectivo", label: "Por estructura" },
            { value: "users", label: "Por usuario" },
            { value: "tag", label: "Por etiqueta" },
          ]}
          mb="sm"
        />

        {scope === "colectivo" && (
          <OrgUnitSelect
            label="Estructura destino"
            description="Se notificará también a las estructuras que dependen de ella"
            placeholder="Selecciona una estructura"
            clearable={false}
            value={orgUnitId}
            onChange={setOrgUnitId}
            mb="sm"
          />
        )}

        {scope === "tag" && (
          <Select
            label="Etiqueta destino"
            description="Transversal a la estructura, pero solo llega a usuarios de tu ámbito"
            placeholder="Selecciona una etiqueta"
            data={tagOptions}
            value={groupTag}
            onChange={setGroupTag}
            searchable
            nothingFoundMessage="Sin etiquetas en tu ámbito"
            mb="sm"
          />
        )}

        {scope === "users" && (
          <MultiSelect
            label="Usuarios destino"
            placeholder="Selecciona usuarios"
            value={selectedUsers}
            onChange={setSelectedUsers}
            data={userOptions}
            searchable
            mb="sm"
          />
        )}

        <TextInput
          label="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          mb="sm"
        />

        <Textarea
          label="Mensaje"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          minRows={3}
          mb="sm"
        />

        <Group justify="flex-end">
          <Button onClick={handleSend} loading={sending}>Enviar notificación</Button>
        </Group>
      </Card>

      {result && (() => {
        const configError = CONFIG_ERROR_REASONS.includes(result.reason);
        const sent = result.sent ?? 0;
        const explanation = describeReason(result.reason);
        const color = configError ? "red" : sent > 0 ? "teal" : "yellow";
        const icon = configError ? <IconAlertTriangle size={18} /> : sent > 0 ? <IconCircleCheck size={18} /> : <IconAlertTriangle size={18} />;
        const alertTitle = configError
          ? "No se pudo enviar: configuración pendiente"
          : sent > 0
          ? `Enviada a ${sent} dispositivo(s)`
          : "No se envió a ningún dispositivo";
        return (
          <Alert mt="md" color={color} icon={icon} title={alertTitle} withCloseButton onClose={() => setResult(null)}>
            {explanation && <Text size="sm" mb="xs">{explanation}</Text>}
            <Text size="sm" c="dimmed">
              Usuarios objetivo: {result.target_users ?? 0} · Dispositivos: {result.tokens ?? 0} ·
              Enviadas: {sent} · Fallidas: {result.failed ?? 0}
            </Text>
          </Alert>
        );
      })()}
    </>
  );
}
