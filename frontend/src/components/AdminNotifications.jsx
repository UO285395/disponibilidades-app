import { useEffect, useMemo, useState } from "react";
import { adminAPI } from "../api/adminApi.js";
import { Card, Title, Text, TextInput, Textarea, Button, Group, Select, MultiSelect } from "@mantine/core";

export default function AdminNotifications() {
  const [users, setUsers] = useState([]);
  const [scope, setScope] = useState("all");
  const [collective, setCollective] = useState("");
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

  async function handleSend() {
    if (!title.trim() || !body.trim()) {
      alert("Título y mensaje son obligatorios");
      return;
    }

    const payload = {
      scope,
      title: title.trim(),
      body: body.trim(),
      collective: scope === "colectivo" ? collective.trim().toLowerCase() : null,
      user_ids: scope === "users" ? selectedUsers.map((id) => Number(id)) : null,
    };

    if (scope === "colectivo" && !payload.collective) {
      alert("Indica un colectivo para el envío por colectivo");
      return;
    }
    if (scope === "users" && payload.user_ids.length === 0) {
      alert("Selecciona al menos un usuario");
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
        Envío manual de notificaciones push por alcance: global, por colectivo o por usuario.
      </Text>

      <Card shadow="sm" p="md" withBorder>
        <Select
          label="Alcance"
          value={scope}
          onChange={(v) => setScope(v || "all")}
          data={[
            { value: "all", label: "General (todos)" },
            { value: "colectivo", label: "Por colectivo" },
            { value: "users", label: "Individual (usuarios)" },
          ]}
          mb="sm"
        />

        {scope === "colectivo" && (
          <TextInput
            label="Colectivo"
            placeholder="ej: empresa.com"
            value={collective}
            onChange={(e) => setCollective(e.target.value)}
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
