import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Box, Title, Text, Button, TextInput, Textarea, NumberInput, Select, Stack, Card } from "@mantine/core";
import { request } from "../api/api.js";

export default function CensusForm() {
  const { token } = useParams();
  const [fields, setFields] = useState(null);
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await request(`/censo/${token}/fields`, "GET", null, false);
        setFields(data.fields || []);
        const init = {};
        (data.fields || []).forEach((f) => {
          init[String(f.id)] = "";
        });
        setValues(init);
      } catch (e) {
        setError("Formulario no encontrado o enlace incorrecto.");
      }
    })();
  }, [token]);

  function setValue(id, val) {
    setValues((prev) => ({ ...prev, [String(id)]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Validar obligatorios
    for (const f of fields) {
      if (f.required && !String(values[String(f.id)] ?? "").trim()) {
        alert(`El campo "${f.label}" es obligatorio.`);
        return;
      }
    }

    try {
      setSubmitting(true);
      await request(`/censo/${token}`, "POST", values, false);
      setDone(true);
    } catch (e) {
      alert(e?.message || "Error enviando el formulario. Inténtalo de nuevo.");
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

  if (!fields) {
    return (
      <Box p="xl" style={{ textAlign: "center", marginTop: 80 }}>
        <Text c="dimmed">Cargando formulario…</Text>
      </Box>
    );
  }

  if (done) {
    return (
      <Box p="xl" style={{ maxWidth: 500, margin: "80px auto", textAlign: "center" }}>
        <Title order={3} mb="md" c="green">
          ¡Respuesta enviada!
        </Title>
        <Text c="dimmed">Gracias por completar el formulario. Tu respuesta ha sido registrada.</Text>
      </Box>
    );
  }

  return (
    <Box p="xl" style={{ maxWidth: 600, margin: "40px auto" }}>
      <Card shadow="md" p="xl" radius="md">
        <Title order={3} mb="xs">
          Formulario de censo
        </Title>
        <Text size="sm" c="dimmed" mb="lg">
          Completa los campos y envía el formulario.
        </Text>

        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            {fields.map((f) => {
              const fieldId = String(f.id);
              const label = f.required ? `${f.label} *` : f.label;

              if (f.field_type === "textarea") {
                return (
                  <Textarea
                    key={f.id}
                    label={label}
                    required={f.required}
                    value={values[fieldId] ?? ""}
                    onChange={(e) => setValue(f.id, e.target.value)}
                    autosize
                    minRows={3}
                  />
                );
              }

              if (f.field_type === "number") {
                return (
                  <NumberInput
                    key={f.id}
                    label={label}
                    required={f.required}
                    value={values[fieldId] === "" ? "" : Number(values[fieldId])}
                    onChange={(v) => setValue(f.id, v ?? "")}
                  />
                );
              }

              if (f.field_type === "select") {
                return (
                  <Select
                    key={f.id}
                    label={label}
                    required={f.required}
                    data={f.options.map((o) => ({ value: o, label: o }))}
                    value={values[fieldId] || null}
                    onChange={(v) => setValue(f.id, v ?? "")}
                    placeholder="Selecciona una opción"
                  />
                );
              }

              // default: text
              return (
                <TextInput
                  key={f.id}
                  label={label}
                  required={f.required}
                  value={values[fieldId] ?? ""}
                  onChange={(e) => setValue(f.id, e.target.value)}
                />
              );
            })}

            <Button type="submit" loading={submitting} mt="sm">
              Enviar
            </Button>
          </Stack>
        </form>
      </Card>
    </Box>
  );
}
