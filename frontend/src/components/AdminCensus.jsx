import { useEffect, useMemo, useRef, useState } from "react";
import { notifyError, notifySuccess } from "../utils/notify.js";
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
  _key: `tmp-${Date.now()}-${Math.random()}`,
  id: null,
  label: "",
  field_type: "text",
  required: true,
  options: [],
});

function parseOptions(rawOptions) {
  if (!Array.isArray(rawOptions)) return [];
  return rawOptions.map((opt) => String(opt)).filter((opt) => opt.trim().length > 0);
}

function normalizeFieldFromServer(field) {
  return {
    _key: `field-${field.id}`,
    id: field.id,
    label: field.label,
    field_type: field.field_type,
    required: Boolean(field.required),
    options: parseOptions(field.options),
  };
}

export default function AdminCensus() {
  const [config, setConfig] = useState(null);
  const [emailTo, setEmailTo] = useState("");
  const [fields, setFields] = useState([emptyField()]);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [draggedFieldKey, setDraggedFieldKey] = useState(null);
  const [draggedOptionMeta, setDraggedOptionMeta] = useState(null);

  const initialLoadCompletedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminAPI.getCensusConfig();
        if (data) {
          setConfig(data);
          setEmailTo(data.email_to);
          if (Array.isArray(data.fields) && data.fields.length > 0) {
            setFields(data.fields.map(normalizeFieldFromServer));
          } else {
            setFields([emptyField()]);
          }
        }
      } catch (e) {
        console.error("Error cargando censo", e);
      } finally {
        setLoaded(true);
        initialLoadCompletedRef.current = true;
      }
    })();
  }, []);

  const hasRequiredInfo = useMemo(() => {
    if (!emailTo.trim()) return false;
    return fields.every((f) => f.label.trim().length > 0);
  }, [emailTo, fields]);

  function buildPayload(currentEmail, currentFields) {
    const trimmedEmail = currentEmail.trim();
    if (!trimmedEmail) {
      return { payload: null, error: "Completa el email para guardar los cambios." };
    }

    if (currentFields.some((f) => !f.label.trim())) {
      return { payload: null, error: "Todas las etiquetas deben tener texto para guardar." };
    }

    const normalizedFields = currentFields.map((f, i) => {
      const options = f.field_type === "select"
        ? (Array.isArray(f.options) ? f.options : [])
            .map((opt) => opt.trim())
            .filter(Boolean)
        : [];

      return {
        id: Number.isInteger(f.id) ? f.id : null,
        label: f.label.trim(),
        field_type: f.field_type,
        required: Boolean(f.required),
        order_index: i,
        options: f.field_type === "select" ? options : null,
      };
    });

    return {
      payload: {
        email_to: trimmedEmail,
        fields: normalizedFields,
      },
      error: null,
    };
  }

  async function saveConfig(currentEmail, currentFields, { silent = false } = {}) {
    const { payload, error } = buildPayload(currentEmail, currentFields);
    if (!payload) {
      setSaveError(error || "No se pudo guardar la configuración.");
      if (!silent) {
        notifyError(error || "No se pudo guardar la configuración.");
      }
      return false;
    }

    try {
      setSaving(true);
      setSaveError("");
      const updated = await adminAPI.upsertCensusConfig(payload);
      setConfig(updated);
      setLastSavedAt(new Date());

      if (updated && Array.isArray(updated.fields)) {
        setFields((prev) =>
          prev.map((localField, index) => {
            const serverField = updated.fields[index];
            if (!serverField) return localField;
            return {
              ...localField,
              id: serverField.id,
            };
          })
        );
      }

      return true;
    } catch (e) {
      console.error("Error guardando censo", e);
      const msg = e?.message || "Error guardando la configuración";
      setSaveError(msg);
      if (!silent) {
        notifyError(msg);
      }
      return false;
    } finally {
      setSaving(false);
    }
  }


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

  function reorderFields(fromKey, toKey) {
    if (fromKey === toKey) return;
    setFields((prev) => {
      const fromIndex = prev.findIndex((field) => field._key === fromKey);
      const toIndex = prev.findIndex((field) => field._key === toKey);
      if (fromIndex < 0 || toIndex < 0) return prev;

      const reordered = [...prev];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      return reordered;
    });
  }

  function addOption(fieldKey) {
    updateField(fieldKey, {
      options: [...(fields.find((f) => f._key === fieldKey)?.options || []), ""],
    });
  }

  function updateOption(fieldKey, optionIndex, value) {
    setFields((prev) =>
      prev.map((f) => {
        if (f._key !== fieldKey) return f;
        const nextOptions = [...(f.options || [])];
        nextOptions[optionIndex] = value;
        return { ...f, options: nextOptions };
      })
    );
  }

  function removeOption(fieldKey, optionIndex) {
    setFields((prev) =>
      prev.map((f) => {
        if (f._key !== fieldKey) return f;
        return {
          ...f,
          options: (f.options || []).filter((_, idx) => idx !== optionIndex),
        };
      })
    );
  }

  function reorderOptions(fieldKey, fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    setFields((prev) =>
      prev.map((f) => {
        if (f._key !== fieldKey) return f;
        const opts = [...(f.options || [])];
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= opts.length || toIndex >= opts.length) {
          return f;
        }
        const [moved] = opts.splice(fromIndex, 1);
        opts.splice(toIndex, 0, moved);
        return { ...f, options: opts };
      })
    );
  }

  async function saveNow() {
    const ok = await saveConfig(emailTo, fields, { silent: false });
    if (ok) notifySuccess("Configuración del censo guardada");
  }

  async function regenerateToken() {
    if (!window.confirm("¿Generar una nueva URL? La URL anterior quedará inaccesible.")) return;
    try {
      setRegenerating(true);
      const result = await adminAPI.regenerateCensusToken();
      setConfig((prev) => ({ ...prev, url_token: result.url_token }));
    } catch (e) {
      console.error("Error regenerando token", e);
      notifyError("Error al regenerar la URL");
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

      <Group gap="xs" mb="md">
        <Badge color={saving ? "yellow" : saveError ? "red" : lastSavedAt ? "green" : "gray"} variant="light">
          {saving ? "Guardando..." : saveError ? "Error al guardar" : lastSavedAt ? "Guardado" : "Sin guardar"}
        </Badge>
        <Text size="xs" c="dimmed">
          {saveError
            ? saveError
            : lastSavedAt
              ? `Última actualización: ${lastSavedAt.toLocaleTimeString()}`
              : "Pulsa «Guardar» para aplicar los cambios."}
        </Text>
      </Group>

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

      <Text size="xs" c="dimmed" mb="sm">
        Arrastra para reordenar campos y opciones. Los cambios se aplican en tiempo real.
      </Text>

      <Stack gap="sm" mb="lg">
        {fields.map((f, idx) => (
          <Card
            key={f._key}
            shadow="xs"
            p="sm"
            withBorder
            draggable
            onDragStart={() => setDraggedFieldKey(f._key)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (draggedFieldKey) {
                reorderFields(draggedFieldKey, f._key);
              }
              setDraggedFieldKey(null);
            }}
            onDragEnd={() => setDraggedFieldKey(null)}
          >
            <Group justify="space-between" mb="xs">
              <Badge variant="outline" size="sm">
                Campo {idx + 1} - arrastra para ordenar
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
              <Card mt="xs" p="sm" withBorder radius="md">
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={500}>
                    Opciones
                  </Text>
                  <Button size="xs" variant="light" onClick={() => addOption(f._key)}>
                    + Añadir opcion
                  </Button>
                </Group>

                <Stack gap="xs">
                  {(f.options || []).map((option, optionIndex) => (
                    <Group
                      key={`${f._key}-opt-${optionIndex}`}
                      wrap="nowrap"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (!draggedOptionMeta) return;
                        if (draggedOptionMeta.fieldKey !== f._key) return;
                        reorderOptions(f._key, draggedOptionMeta.optionIndex, optionIndex);
                        setDraggedOptionMeta(null);
                      }}
                    >
                      <ActionIcon
                        variant="subtle"
                        draggable
                        onDragStart={() => setDraggedOptionMeta({ fieldKey: f._key, optionIndex })}
                        onDragEnd={() => setDraggedOptionMeta(null)}
                        title="Arrastra para ordenar"
                      >
                        ↕
                      </ActionIcon>
                      <TextInput
                        style={{ flex: 1 }}
                        placeholder={`Opcion ${optionIndex + 1}`}
                        value={option}
                        onChange={(e) => updateOption(f._key, optionIndex, e.target.value)}
                      />
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        onClick={() => removeOption(f._key, optionIndex)}
                      >
                        ✕
                      </ActionIcon>
                    </Group>
                  ))}

                  {(!f.options || f.options.length === 0) && (
                    <Text size="xs" c="dimmed">
                      Añade al menos una opcion para este campo de seleccion.
                    </Text>
                  )}
                </Stack>
              </Card>
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

      <Button size="md" onClick={saveNow} loading={saving} disabled={!hasRequiredInfo}>
        Guardar configuración
      </Button>
    </>
  );
}
