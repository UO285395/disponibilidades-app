import { useEffect, useState } from "react";
import {
  Title, Text, TextInput, Button, Group, Card, Select,
  Checkbox, ActionIcon, Stack, Badge, CopyButton, Divider,
} from "@mantine/core";
import { adminAPI } from "../api/adminApi.js";

const FIELD_TYPES = [
  { value: "text", label: "Texto corto" },
  { value: "textarea", label: "Texto largo" },
  { value: "number", label: "Número" },
  { value: "select", label: "Selección (opciones)" },
];

const emptyField = () => ({
  _key: Math.random(),
  label: "",
  field_type: "text",
  required: true,
  options: "",
});

export default function AdminCensus() {
  const [config, setConfig] = useState(null);
  const [emailTo, setEmailTo] = useState("");
  const [fields, setFields] = useState([emptyField()]);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminAPI.getCensusConfig();
        if (data) {
          setConfig(data);
          setEmailTo(data.email_to);
          setFields(
            data.fields.map((f) => ({
              _key: f.id,
              label: f.label,
              field_type: f.field_type,
              required: f.required,
              options: Array.isArray(f.options) ? f.options.join(", ") : "",
            }))
          );
        }
      } catch (e) {
        console.error("Error cargando censo", e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  function addField() {
    setFields((prev) => [...prev, emptyField()]);
  }

  function removeField(key) {
    setFields((prev) => prev.filter((f) => f._key !== key));
  }

  function updateField(key, patch) {
    setFields((prev) =>
      prev.map((f) => (f._key === key ? { ...f, ...patch } : f))
    );
  }

  async function save() {
    if (!emailTo.trim()) {
      alert("Indica el email destinatario");
      return;
    }
    if (fields.some((f) => !f.label.trim())) {
      alert("Todos los campos deben tener una etiqueta");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        email_to: emailTo.trim(),
        fields: fields.map((f, i) => ({
          label: f.label.trim(),
          field_type: f.field_type,
          required: f.required,
          order_index: i,
          options:
            f.field_type === "select" && f.options
              ? f.options.split(",").map((o) => o.trim()).filter(Boolean)
              : null,
        })),
      };
      const updated = await adminAPI.upsertCensusConfig(payload);
      setConfig(updated);
    } catch (e) {
      console.error("Error guardando censo", e);
      alert(e?.message || "Error guardando la configuración");
    } finally {
      setSaving(false);
    }
  }

  async function regenerateToken() {
    if (!window.confirm("¿Generar una nueva URL? La URL anterior quedará inaccesible.")) return;
    try {
      setRegenerating(true);
      const result = await adminAPI.regenerateCensusToken();
      setConfig((prev) => ({ ...prev, url_token: result.url_token }));
    } catch (e) {
      console.error("Error regenerando token", e);
      alert("Error al regenerar la URL");
    } finally {
      setRegenerating(false);
    }
  }

  async function testEmail() {
    if (!emailTo.trim()) {
      setTestMessage("Error al enviar email de prueba: indica un email destinatario.");
      return;
    }

    try {
      setTestingEmail(true);
      setTestMessage("");
      const result = await adminAPI.testCensusEmail({ email_to: emailTo.trim() });
      setTestMessage(`Email de prueba enviado correctamente a ${result?.email_to || emailTo.trim()}.`);
    } catch (e) {
      console.error("Error enviando email de prueba", e);
      setTestMessage(`Error al enviar email de prueba: ${e?.message || "desconocido"}`);
    } finally {
      setTestingEmail(false);
    }
  }

  if (!loaded) return null;

  const censusUrl = config
    ? `${window.location.origin}/censo/${config.url_token}`
    : null;

  return (
    <>
      <Title order={3} mb="md">
        Configuración del censo
      </Title>

      <Text size="sm" c="dimmed" mb="lg">
        Define los campos del formulario y el correo al que se enviarán las respuestas en CSV.
        El formulario es accesible únicamente por URL directa (sin login).
      </Text>

      {/* URL del formulario */}
      {config && (
        <Card shadow="sm" p="md" mb="xl" withBorder>
          <Text fw={600} mb="xs">
            URL del formulario
          </Text>
          <Group gap="xs" wrap="nowrap">
            <TextInput
              readOnly
              value={censusUrl}
              style={{ flex: 1 }}
              styles={{ input: { fontFamily: "monospace", fontSize: 13 } }}
            />
            <CopyButton value={censusUrl}>
              {({ copied, copy }) => (
                <Button variant="outline" size="sm" onClick={copy}>
                  {copied ? "¡Copiado!" : "Copiar"}
                </Button>
              )}
            </CopyButton>
            <Button
              variant="subtle"
              color="red"
              size="sm"
              loading={regenerating}
              onClick={regenerateToken}
            >
              Regenerar URL
            </Button>
          </Group>
          <Text size="xs" c="dimmed" mt="xs">
            Comparte esta URL con los participantes. Al regenerarla la anterior deja de funcionar.
          </Text>
        </Card>
      )}

      {/* Email destino */}
      <TextInput
        label="Email destinatario de respuestas"
        description="Cada envío llegará como adjunto CSV a este correo."
        placeholder="ejemplo@colectivo.org"
        value={emailTo}
        onChange={(e) => setEmailTo(e.target.value)}
        mb="lg"
      />

      <Group mb="lg">
        <Button variant="light" onClick={testEmail} loading={testingEmail}>
          Enviar email de prueba
        </Button>
        {testMessage && (
          <Text size="sm" c={testMessage.startsWith("Error") ? "red" : "green"}>
            {testMessage}
          </Text>
        )}
      </Group>

      <Divider mb="lg" label="Campos del formulario" labelPosition="left" />

      <Stack gap="sm" mb="lg">
        {fields.map((f, idx) => (
          <Card key={f._key} shadow="xs" p="sm" withBorder>
            <Group justify="space-between" mb="xs">
              <Badge variant="outline" size="sm">
                Campo {idx + 1}
              </Badge>
              <ActionIcon
                color="red"
                variant="subtle"
                size="sm"
                onClick={() => removeField(f._key)}
                disabled={fields.length === 1}
              >
                ✕
              </ActionIcon>
            </Group>

            <Group grow align="flex-start">
              <TextInput
                label="Etiqueta"
                placeholder="Ej: Nombre completo"
                value={f.label}
                onChange={(e) => updateField(f._key, { label: e.target.value })}
              />
              <Select
                label="Tipo"
                data={FIELD_TYPES}
                value={f.field_type}
                onChange={(v) => updateField(f._key, { field_type: v })}
              />
            </Group>

            {f.field_type === "select" && (
              <TextInput
                mt="xs"
                label="Opciones (separadas por coma)"
                placeholder="Opción A, Opción B, Opción C"
                value={f.options}
                onChange={(e) => updateField(f._key, { options: e.target.value })}
              />
            )}

            <Checkbox
              mt="xs"
              label="Campo obligatorio"
              checked={f.required}
              onChange={(e) => updateField(f._key, { required: e.currentTarget.checked })}
            />
          </Card>
        ))}
      </Stack>

      <Group mb="xl">
        <Button variant="outline" onClick={addField}>
          + Añadir campo
        </Button>
      </Group>

      <Button onClick={save} loading={saving}>
        Guardar configuración
      </Button>
    </>
  );
}
