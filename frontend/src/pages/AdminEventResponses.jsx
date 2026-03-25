import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminAPI } from "../api/adminApi.js";
import { Card, Title, Text, Button, Box, TextInput } from "@mantine/core";

// ========================================
// Función para resumen de votos
// ========================================
function normalizeAnswer(answer) {
  const v = String(answer ?? "").trim().toLowerCase();
  if (v === "yes" || v === "si") return "si";
  if (v === "no") return "no";
  return v;
}

function resumirVotos(responses) {
  const seen = new Set();
  let si = 0;
  let no = 0;

  for (const r of responses) {
    const key = r.user_id ?? r.user_full_name; // 1 voto por usuario
    if (seen.has(key)) continue;
    seen.add(key);

    const a = normalizeAnswer(r.answer);
    if (a === "si") si++;
    else if (a === "no") no++;
  }

  return { si, no };
}

function formatRespuesta(answer) {
  const a = normalizeAnswer(answer);
  if (a === "si") return "Sí";
  if (a === "no") return "No";
  return String(answer ?? "");
}

export default function AdminEventResponses() {
  const { id } = useParams();
  const [responses, setResponses] = useState([]);
  const [eventName, setEventName] = useState("");
  const [filterDomain, setFilterDomain] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) Obtener respuestas
        const resp = await adminAPI.getEventResponses(id);
        if (!cancelled) setResponses(resp);

        // 2) Obtener título del evento
        const ev = await adminAPI.getEvent(id);
        if (!cancelled) setEventName(ev.title);

      } catch (e) {
        console.error("Error cargando respuestas", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const filteredResponses = useMemo(() => {
    const domainSearch = filterDomain.trim().toLowerCase();
    if (!domainSearch) return responses;

    return responses.filter((r) => {
      const domain = String(r.user_domain || "").toLowerCase();
      return domain.includes(domainSearch);
    });
  }, [responses, filterDomain]);

  const { si, no } = resumirVotos(filteredResponses);
  const simpas = filteredResponses.reduce((acc, r) => acc + Number(r.companions_count || 0), 0);

  return (
    <Box p="lg">
      <Button mb="md" variant="outline" onClick={() => navigate("/admin")}>
        Volver
      </Button>

      <Title order={2} mb="lg">
        Respuestas del evento {eventName || "(cargando...)"}
      </Title>

      <TextInput
        placeholder="Filtrar por colectivo (código del email)"
        value={filterDomain}
        onChange={(e) => setFilterDomain(e.target.value)}
        mb="lg"
      />

      {/* ========================================
          RESUMEN DE VOTOS
         ======================================== */}
      <Card shadow="sm" p="lg" mb="lg" style={{ background: "#eef6ff" }}>
        <Title order={4} mb="sm">Resumen de votos</Title>
        <Text><b>Sí:</b> {si}</Text>
        <Text><b>No:</b> {no}</Text>
        <Text><b>+ Simpas:</b> {simpas}</Text>
      </Card>

      {filteredResponses.length === 0 && (
        <Text>No hay respuestas todavía.</Text>
      )}

      {filteredResponses.map((r, idx) => (
        <Card key={r.user_id ?? idx} mt="md" shadow="sm" p="lg">
          <Text fw={600}>{r.user_full_name}</Text>
          <Text c="dimmed" size="sm">
            Dominio: {r.user_domain || "-"}
          </Text>
          <Text>
            <b>Respuesta:</b> {formatRespuesta(r.answer)}
          </Text>
          <Text>
            <b>+ Simpas:</b> {r.companions_count ?? 0}
          </Text>
          {r.justification && (
            <Text>
              <b>Justificación:</b> {r.justification}
            </Text>
          )}
        </Card>
      ))}
    </Box>
  );
}
