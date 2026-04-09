import { useEffect, useMemo, useState } from "react";
import {
  Tabs,
  Title,
  Text,
  TextInput,
  Textarea,
  Button,
  Group,
  Card,
  Select,
  Checkbox,
  ActionIcon,
  Stack,
  Badge,
  CopyButton,
  Divider,
  Table,
  Alert,
} from "@mantine/core";
import { adminAPI } from "../api/adminApi.js";

const FIELD_TYPES = [
  { value: "text", label: "Texto corto" },
  { value: "textarea", label: "Texto largo" },
  { value: "number", label: "Numero" },
  { value: "select", label: "Seleccion (opciones)" },
];

const emptyField = () => ({
  _key: Math.random(),
  label: "",
  field_type: "text",
  required: true,
  options: "",
});

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-ES");
}

export default function AdminSurveys() {
  const [surveys, setSurveys] = useState([]);
  const [loadingSurveys, setLoadingSurveys] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState([emptyField()]);
  const [saving, setSaving] = useState(false);

  const [selectedSurveyId, setSelectedSurveyId] = useState(null);
  const [selectedSurveyData, setSelectedSurveyData] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loadingResponses, setLoadingResponses] = useState(false);

  const selectedSurvey = useMemo(
    () => surveys.find((s) => String(s.id) === String(selectedSurveyId)) || null,
    [surveys, selectedSurveyId]
  );

  const surveyUrl = selectedSurvey
    ? `${window.location.origin}/encuesta/${selectedSurvey.url_token}`
    : "";

  useEffect(() => {
    loadSurveys();
  }, []);

  async function loadSurveys() {
    try {
      setLoadingSurveys(true);
      const data = await adminAPI.listSurveys();
      setSurveys(Array.isArray(data) ? data : []);

      if (Array.isArray(data) && data.length > 0) {
        setSelectedSurveyId((prev) => prev || String(data[0].id));
      } else {
        setSelectedSurveyId(null);
      }
    } catch (e) {
      console.error("Error cargando encuestas", e);
      alert(e?.message || "Error cargando encuestas");
    } finally {
      setLoadingSurveys(false);
    }
  }

  useEffect(() => {
    if (!selectedSurveyId) {
      setSelectedSurveyData(null);
      setResponses([]);
      return;
    }

    (async () => {
      try {
        setLoadingResponses(true);
        const result = await adminAPI.getSurveyResponses(selectedSurveyId);
        setSelectedSurveyData(result?.survey || null);
        setResponses(Array.isArray(result?.responses) ? result.responses : []);
      } catch (e) {
        console.error("Error cargando votaciones", e);
        setSelectedSurveyData(null);
        setResponses([]);
      } finally {
        setLoadingResponses(false);
      }
    })();
  }, [selectedSurveyId]);

  function addField() {
    setFields((prev) => [...prev, emptyField()]);
  }

  function removeField(key) {
    setFields((prev) => prev.filter((f) => f._key !== key));
  }

  function updateField(key, patch) {
    setFields((prev) => prev.map((f) => (f._key === key ? { ...f, ...patch } : f)));
  }

  function clearCreationForm() {
    setTitle("");
    setDescription("");
    setFields([emptyField()]);
  }

  async function createSurvey() {
    if (!title.trim()) {
      alert("Indica un titulo para la encuesta");
      return;
    }
    if (fields.length === 0) {
      alert("Debes añadir al menos un campo");
      return;
    }
    if (fields.some((f) => !f.label.trim())) {
      alert("Todos los campos deben tener una etiqueta");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        fields: fields.map((f, i) => ({
          label: f.label.trim(),
          field_type: f.field_type,
          required: f.required,
          order_index: i,
          options:
            f.field_type === "select" && f.options
              ? f.options
                  .split(",")
                  .map((o) => o.trim())
                  .filter(Boolean)
              : null,
        })),
      };

      const created = await adminAPI.createSurvey(payload);
      await loadSurveys();
      setSelectedSurveyId(String(created.id));
      clearCreationForm();
    } catch (e) {
      console.error("Error creando encuesta", e);
      alert(e?.message || "Error creando encuesta");
    } finally {
      setSaving(false);
    }
  }

  async function regenerateToken() {
    if (!selectedSurvey) return;
    if (!window.confirm("¿Regenerar URL? La URL anterior dejara de funcionar.")) return;

    try {
      const result = await adminAPI.regenerateSurveyToken(selectedSurvey.id);
      setSurveys((prev) =>
        prev.map((s) =>
          s.id === selectedSurvey.id ? { ...s, url_token: result.url_token } : s
        )
      );
      setSelectedSurveyData((prev) =>
        prev ? { ...prev, url_token: result.url_token } : prev
      );
    } catch (e) {
      console.error("Error regenerando URL", e);
      alert(e?.message || "Error regenerando URL");
    }
  }

  const surveyOptions = surveys.map((s) => ({
    value: String(s.id),
    label: `${s.title} (${s.responses_count || 0} respuestas)`,
  }));

  const responseFields = selectedSurveyData?.fields || [];

  return (
    <>
      <Title order={3} mb="md">
        Encuestas
      </Title>

      <Text size="sm" c="dimmed" mb="lg">
        Crea encuestas publicas con URL directa y consulta las votaciones desde este panel.
      </Text>

      <Tabs defaultValue="creation">
        <Tabs.List>
          <Tabs.Tab value="creation">Creacion encuesta</Tabs.Tab>
          <Tabs.Tab value="votes">Votaciones</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="creation" pt="lg">
          <Card shadow="sm" p="md" mb="lg" withBorder>
            <TextInput
              label="Titulo"
              placeholder="Ej: Encuesta de prioridades del colectivo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              mb="sm"
            />

            <Textarea
              label="Descripcion (opcional)"
              placeholder="Explica brevemente el objetivo de la encuesta"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autosize
              minRows={2}
              mb="lg"
            />

            <Divider mb="lg" label="Campos de la encuesta" labelPosition="left" />

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
                      x
                    </ActionIcon>
                  </Group>

                  <Group grow align="flex-start">
                    <TextInput
                      label="Etiqueta"
                      placeholder="Ej: Nombre"
                      value={f.label}
                      onChange={(e) => updateField(f._key, { label: e.target.value })}
                    />
                    <Select
                      label="Tipo"
                      data={FIELD_TYPES}
                      value={f.field_type}
                      onChange={(v) => updateField(f._key, { field_type: v || "text" })}
                    />
                  </Group>

                  {f.field_type === "select" && (
                    <TextInput
                      mt="xs"
                      label="Opciones (separadas por coma)"
                      placeholder="Opcion A, Opcion B"
                      value={f.options}
                      onChange={(e) => updateField(f._key, { options: e.target.value })}
                    />
                  )}

                  <Checkbox
                    mt="xs"
                    label="Campo obligatorio"
                    checked={f.required}
                    onChange={(e) =>
                      updateField(f._key, { required: e.currentTarget.checked })
                    }
                  />
                </Card>
              ))}
            </Stack>

            <Group mb="xl">
              <Button variant="outline" onClick={addField}>
                + Anadir campo
              </Button>
            </Group>

            <Button onClick={createSurvey} loading={saving}>
              Crear encuesta
            </Button>
          </Card>

          <Card shadow="sm" p="md" withBorder>
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Encuestas creadas</Text>
              <Button variant="light" size="xs" onClick={loadSurveys} loading={loadingSurveys}>
                Recargar
              </Button>
            </Group>

            {surveys.length === 0 ? (
              <Text size="sm" c="dimmed">No hay encuestas creadas todavia.</Text>
            ) : (
              <Stack gap="xs">
                {surveys.map((survey) => (
                  <Card key={survey.id} withBorder p="sm">
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Text fw={600}>{survey.title}</Text>
                        <Text size="xs" c="dimmed">{survey.description || "Sin descripcion"}</Text>
                        <Text size="xs" c="dimmed">
                          Respuestas: {survey.responses_count || 0} · Creada: {formatDateTime(survey.created_at)}
                        </Text>
                      </div>
                      <Button
                        size="xs"
                        variant={String(selectedSurveyId) === String(survey.id) ? "filled" : "light"}
                        onClick={() => setSelectedSurveyId(String(survey.id))}
                      >
                        Seleccionar
                      </Button>
                    </Group>
                  </Card>
                ))}
              </Stack>
            )}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="votes" pt="lg">
          <Card shadow="sm" p="md" mb="lg" withBorder>
            <Group grow align="flex-end">
              <Select
                label="Encuesta"
                placeholder="Selecciona una encuesta"
                data={surveyOptions}
                value={selectedSurveyId}
                onChange={(v) => setSelectedSurveyId(v)}
                searchable
              />
              <Button variant="outline" onClick={regenerateToken} disabled={!selectedSurvey}>
                Regenerar URL
              </Button>
            </Group>

            {selectedSurvey && (
              <>
                <Text size="sm" c="dimmed" mt="md" mb="xs">
                  URL publica para votar
                </Text>
                <Group gap="xs" wrap="nowrap">
                  <TextInput
                    readOnly
                    value={surveyUrl}
                    style={{ flex: 1 }}
                    styles={{ input: { fontFamily: "monospace", fontSize: 13 } }}
                  />
                  <CopyButton value={surveyUrl}>
                    {({ copied, copy }) => (
                      <Button variant="outline" size="sm" onClick={copy}>
                        {copied ? "Copiado" : "Copiar"}
                      </Button>
                    )}
                  </CopyButton>
                </Group>
              </>
            )}
          </Card>

          {!selectedSurveyId ? (
            <Alert color="blue">No hay encuestas para mostrar votaciones.</Alert>
          ) : loadingResponses ? (
            <Text c="dimmed">Cargando votaciones...</Text>
          ) : (
            <Card shadow="sm" p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600}>Respuestas recibidas</Text>
                <Badge>{responses.length}</Badge>
              </Group>

              {responses.length === 0 ? (
                <Text size="sm" c="dimmed">Aun no hay respuestas para esta encuesta.</Text>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <Table withColumnBorders striped highlightOnHover style={{ minWidth: 900 }}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Fecha</Table.Th>
                        {responseFields.map((field) => (
                          <Table.Th key={field.id}>{field.label}</Table.Th>
                        ))}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {responses.map((response) => (
                        <Table.Tr key={response.id}>
                          <Table.Td>{formatDateTime(response.submitted_at)}</Table.Td>
                          {responseFields.map((field) => (
                            <Table.Td key={`${response.id}-${field.id}`}>
                              {response.answers?.[String(field.id)] || ""}
                            </Table.Td>
                          ))}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </div>
              )}
            </Card>
          )}
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
