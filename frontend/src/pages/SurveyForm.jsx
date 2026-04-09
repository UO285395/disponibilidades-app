import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Box,
  Title,
  Text,
  Button,
  TextInput,
  Textarea,
  NumberInput,
  Select,
  Stack,
  Card,
} from "@mantine/core";
import { request } from "../api/api.js";

export default function SurveyForm() {
  const { token } = useParams();
  const [survey, setSurvey] = useState(null);
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await request(`/encuesta/${token}/fields`, "GET", null, false);
        setSurvey(data);
        const init = {};
        (data.fields || []).forEach((field) => {
          init[String(field.id)] = "";
        });
        setValues(init);
      } catch (e) {
        setError("Encuesta no encontrada o enlace incorrecto.");
      }
    })();
  }, [token]);

  function setValue(id, value) {
    setValues((prev) => ({ ...prev, [String(id)]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const fields = survey?.fields || [];
    for (const field of fields) {
      if (field.required && !String(values[String(field.id)] ?? "").trim()) {
        alert(`El campo "${field.label}" es obligatorio.`);
        return;
      }
    }

    try {
      setSubmitting(true);
      await request(`/encuesta/${token}`, "POST", values, false);
      setDone(true);
    } catch (e) {
      alert(e?.message || "Error enviando la encuesta. Intentalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <Box p="xl" style={{ maxWidth: 500, margin: "80px auto", textAlign: "center" }}>
        <Text c="red" fw={600} size="lg">
          {error}
        </Text>
      </Box>
    );
  }

  if (!survey) {
    return (
      <Box p="xl" style={{ textAlign: "center", marginTop: 80 }}>
        <Text c="dimmed">Cargando encuesta...</Text>
      </Box>
    );
  }

  if (done) {
    return (
      <Box p="xl" style={{ maxWidth: 500, margin: "80px auto", textAlign: "center" }}>
        <Title order={3} mb="md" c="green">
          Voto registrado
        </Title>
        <Text c="dimmed">Gracias por participar en la encuesta.</Text>
      </Box>
    );
  }

  const fields = survey.fields || [];

  return (
    <Box p="xl" style={{ maxWidth: 600, margin: "40px auto" }}>
      <Card shadow="md" p="xl" radius="md">
        <Title order={3} mb="xs">
          {survey.title || "Encuesta"}
        </Title>
        <Text size="sm" c="dimmed" mb="lg">
          {survey.description || "Completa los campos y envia tu voto."}
        </Text>

        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            {fields.map((field) => {
              const fieldId = String(field.id);
              const label = field.required ? `${field.label} *` : field.label;

              if (field.field_type === "textarea") {
                return (
                  <Textarea
                    key={field.id}
                    label={label}
                    required={field.required}
                    value={values[fieldId] ?? ""}
                    onChange={(e) => setValue(field.id, e.target.value)}
                    autosize
                    minRows={3}
                  />
                );
              }

              if (field.field_type === "number") {
                return (
                  <NumberInput
                    key={field.id}
                    label={label}
                    required={field.required}
                    value={values[fieldId] === "" ? "" : Number(values[fieldId])}
                    onChange={(v) => setValue(field.id, v ?? "")}
                  />
                );
              }

              if (field.field_type === "select") {
                return (
                  <Select
                    key={field.id}
                    label={label}
                    required={field.required}
                    data={(field.options || []).map((option) => ({
                      value: option,
                      label: option,
                    }))}
                    value={values[fieldId] || null}
                    onChange={(v) => setValue(field.id, v ?? "")}
                    placeholder="Selecciona una opcion"
                  />
                );
              }

              return (
                <TextInput
                  key={field.id}
                  label={label}
                  required={field.required}
                  value={values[fieldId] ?? ""}
                  onChange={(e) => setValue(field.id, e.target.value)}
                />
              );
            })}

            <Button type="submit" loading={submitting} mt="sm">
              Enviar voto
            </Button>
          </Stack>
        </form>
      </Card>
    </Box>
  );
}
