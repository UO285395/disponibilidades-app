import { useEffect, useMemo, useState } from "react";
import { notifyError, notifySuccess } from "../utils/notify.js";
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
  Progress,
  SimpleGrid,
} from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
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
  // null = creando; id = editando esa encuesta.
  const [editingSurveyId, setEditingSurveyId] = useState(null);
  const [activeTab, setActiveTab] = useState("creation");

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
      notifyError(e?.message || "Error cargando encuestas");
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

  // Encuesta en edición y si ya tiene respuestas (en tal caso no se pueden
  // cambiar sus campos, solo título/descripción).
  const editingSurvey = useMemo(
    () => surveys.find((s) => s.id === editingSurveyId) || null,
    [surveys, editingSurveyId]
  );
  const editingHasResponses = (editingSurvey?.responses_count || 0) > 0;

  function clearCreationForm() {
    setEditingSurveyId(null);
    setTitle("");
    setDescription("");
    setFields([emptyField()]);
  }

  function startEdit(survey) {
    setEditingSurveyId(survey.id);
    setTitle(survey.title || "");
    setDescription(survey.description || "");
    setFields(
      (survey.fields || []).map((f) => ({
        _key: `edit-${f.id}`,
        label: f.label,
        field_type: f.field_type,
        required: Boolean(f.required),
        options: Array.isArray(f.options) ? f.options.join(", ") : "",
      }))
    );
    if (!survey.fields || survey.fields.length === 0) setFields([emptyField()]);
    setActiveTab("creation");
  }

  function buildFieldsPayload() {
    return fields.map((f, i) => ({
      label: f.label.trim(),
      field_type: f.field_type,
      required: f.required,
      order_index: i,
      options:
        f.field_type === "select" && f.options
          ? f.options.split(",").map((o) => o.trim()).filter(Boolean)
          : null,
    }));
  }

  async function saveSurvey() {
    if (!title.trim()) {
      notifyError("Indica un titulo para la encuesta");
      return;
    }
    // Al editar una encuesta con respuestas no se tocan los campos.
    const editingFields = !(editingSurveyId && editingHasResponses);
    if (editingFields) {
      if (fields.length === 0) {
        notifyError("Debes añadir al menos un campo");
        return;
      }
      if (fields.some((f) => !f.label.trim())) {
        notifyError("Todos los campos deben tener una etiqueta");
        return;
      }
    }

    try {
      setSaving(true);
      if (editingSurveyId) {
        const payload = {
          title: title.trim(),
          description: description.trim() || null,
          ...(editingFields ? { fields: buildFieldsPayload() } : {}),
        };
        await adminAPI.updateSurvey(editingSurveyId, payload);
        await loadSurveys();
        setSelectedSurveyId(String(editingSurveyId));
        notifySuccess("Encuesta actualizada");
        clearCreationForm();
      } else {
        const payload = {
          title: title.trim(),
          description: description.trim() || null,
          fields: buildFieldsPayload(),
        };
        const created = await adminAPI.createSurvey(payload);
        await loadSurveys();
        setSelectedSurveyId(String(created.id));
        notifySuccess("Encuesta creada");
        clearCreationForm();
      }
    } catch (e) {
      console.error("Error guardando encuesta", e);
      notifyError(e?.message || "Error guardando la encuesta");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSurvey(survey) {
    if (!window.confirm(`¿Eliminar la encuesta "${survey.title}" y todas sus respuestas? Esta acción no se puede deshacer.`)) return;
    try {
      await adminAPI.deleteSurvey(survey.id);
      if (editingSurveyId === survey.id) clearCreationForm();
      if (String(selectedSurveyId) === String(survey.id)) setSelectedSurveyId(null);
      await loadSurveys();
      notifySuccess("Encuesta eliminada");
    } catch (e) {
      console.error("Error eliminando encuesta", e);
      notifyError(e?.message || "No se pudo eliminar la encuesta");
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
      notifyError(e?.message || "Error regenerando URL");
    }
  }

  const surveyOptions = surveys.map((s) => ({
    value: String(s.id),
    label: `${s.title} (${s.responses_count || 0} respuestas)`,
  }));

  const responseFields = useMemo(() => selectedSurveyData?.fields || [], [selectedSurveyData]);

  // Resumen por campo: reparto de opciones (barras) para selección, estadísticos
  // básicos para número, y recuento para texto. Facilita leer las respuestas.
  const fieldSummaries = useMemo(() => {
    return responseFields.map((field) => {
      const values = responses
        .map((r) => r.answers?.[String(field.id)])
        .filter((v) => v !== undefined && v !== null && String(v).trim() !== "");

      if (field.field_type === "select") {
        const counts = {};
        (field.options || []).forEach((o) => { counts[o] = 0; });
        values.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
        return { field, type: "select", counts, total: values.length };
      }
      if (field.field_type === "number") {
        const nums = values.map(Number).filter((n) => !Number.isNaN(n));
        const sum = nums.reduce((a, b) => a + b, 0);
        return {
          field,
          type: "number",
          count: nums.length,
          min: nums.length ? Math.min(...nums) : null,
          max: nums.length ? Math.max(...nums) : null,
          avg: nums.length ? sum / nums.length : null,
        };
      }
      return { field, type: "text", count: values.length };
    });
  }, [responses, responseFields]);

  return (
    <>
      <Title order={3} mb="md">
        Encuestas
      </Title>

      <Text size="sm" c="dimmed" mb="lg">
        Crea encuestas publicas con URL directa y consulta las votaciones desde este panel.
      </Text>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="creation">{editingSurveyId ? "Editar encuesta" : "Creación encuesta"}</Tabs.Tab>
          <Tabs.Tab value="votes">Votaciones</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="creation" pt="lg">
          <Card shadow="sm" p="md" mb="lg" withBorder>
            {editingSurveyId && (
              <Alert color={editingHasResponses ? "yellow" : "blue"} mb="md">
                {editingHasResponses
                  ? "Editando una encuesta con respuestas: solo puedes cambiar el título y la descripción (los campos quedan bloqueados para no romper las respuestas ya recibidas)."
                  : "Editando encuesta. Puedes cambiar título, descripción y campos."}
              </Alert>
            )}
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

            <Stack gap="sm" mb="lg" style={editingHasResponses ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
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
              <Button variant="outline" onClick={addField} disabled={editingHasResponses}>
                + Añadir campo
              </Button>
            </Group>

            <Group>
              <Button onClick={saveSurvey} loading={saving}>
                {editingSurveyId ? "Guardar cambios" : "Crear encuesta"}
              </Button>
              {editingSurveyId && (
                <Button variant="default" onClick={clearCreationForm} disabled={saving}>
                  Cancelar edición
                </Button>
              )}
            </Group>
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
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <div style={{ minWidth: 0 }}>
                        <Text fw={600}>{survey.title}</Text>
                        <Text size="xs" c="dimmed">{survey.description || "Sin descripción"}</Text>
                        <Text size="xs" c="dimmed">
                          Respuestas: {survey.responses_count || 0} · Creada: {formatDateTime(survey.created_at)}
                        </Text>
                      </div>
                      <Group gap={4} wrap="nowrap">
                        <Button
                          size="xs"
                          variant={String(selectedSurveyId) === String(survey.id) ? "filled" : "light"}
                          onClick={() => { setSelectedSurveyId(String(survey.id)); setActiveTab("votes"); }}
                        >
                          Ver
                        </Button>
                        <ActionIcon variant="subtle" color="blue" onClick={() => startEdit(survey)} aria-label="Editar">
                          <IconPencil size={18} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" color="red" onClick={() => deleteSurvey(survey)} aria-label="Eliminar">
                          <IconTrash size={18} />
                        </ActionIcon>
                      </Group>
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
                <Text size="sm" c="dimmed">Aún no hay respuestas para esta encuesta.</Text>
              ) : (
                <>
                {/* Resumen por campo */}
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="lg">
                  {fieldSummaries.map((s) => (
                    <Card key={s.field.id} withBorder padding="sm" radius="md">
                      <Text fw={600} size="sm" mb={6}>{s.field.label}</Text>
                      {s.type === "select" ? (
                        <Stack gap={6}>
                          {Object.entries(s.counts).map(([opt, n]) => {
                            const pct = s.total > 0 ? Math.round((n / s.total) * 100) : 0;
                            return (
                              <div key={opt}>
                                <Group justify="space-between" gap="xs">
                                  <Text size="xs">{opt}</Text>
                                  <Text size="xs" c="dimmed">{n} · {pct}%</Text>
                                </Group>
                                <Progress value={pct} size="sm" />
                              </div>
                            );
                          })}
                          {s.total === 0 && <Text size="xs" c="dimmed">Sin respuestas.</Text>}
                        </Stack>
                      ) : s.type === "number" ? (
                        <Group gap="lg">
                          <Text size="sm">Mín: <b>{s.min ?? "—"}</b></Text>
                          <Text size="sm">Máx: <b>{s.max ?? "—"}</b></Text>
                          <Text size="sm">Media: <b>{s.avg != null ? s.avg.toFixed(1) : "—"}</b></Text>
                          <Text size="xs" c="dimmed">({s.count} resp.)</Text>
                        </Group>
                      ) : (
                        <Text size="sm" c="dimmed">{s.count} respuesta(s) de texto — ver detalle en la tabla.</Text>
                      )}
                    </Card>
                  ))}
                </SimpleGrid>

                <Text fw={600} size="sm" mb="xs">Detalle por respuesta</Text>
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
                </>
              )}
            </Card>
          )}
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
