import { useEffect, useMemo, useState } from "react";
import { adminAPI } from "../api/adminApi.js";
import OrgUnitSelect from "./OrgUnitSelect.jsx";
import { Card, Title, Text, TextInput, Textarea, Button, Group, Select, MultiSelect } from "@mantine/core";

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
      alert("Título y mensaje son obligatorios");
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
      alert("Selecciona la estructura destino");
      return;
    }
    if (scope === "users" && payload.user_ids.length === 0) {
      alert("Selecciona al menos un usuario");
      return;
    }
    if (scope === "tag" && !payload.group_tag) {
      alert("Selecciona la etiqueta destino");
      return;
    }

    try {
      setSending(true);
      const r = await adminAPI.sendNotification(payload);
      setResult(r);
      if (["missing_fcm_key", "missing_fcm_config", "missing_firebase_project_id", "invalid_fcm_service_account", "fcm_auth_error", "missing_google_auth_dependency"].includes(r?.reason)) {
        alert(r?.message || "Falta configurar Firebase/FCM en Railway para poder enviar notificaciones push.");
      }
    } catch (e) {
      console.error("Error enviando notificación", e);
      alert(e?.message || "Error enviando notificación");
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

      {result && (
        <Card mt="md" p="md" withBorder>
          <Text><b>Resultado:</b></Text>
          <Text size="sm">Usuarios objetivo: {result.target_users ?? 0}</Text>
          <Text size="sm">Tokens: {result.tokens ?? 0}</Text>
          <Text size="sm">Enviadas: {result.sent ?? 0}</Text>
          <Text size="sm">Fallidas: {result.failed ?? 0}</Text>
          <Text size="sm" c="dimmed">Motivo: {result.reason || "-"}</Text>
        </Card>
      )}
    </>
  );
}
