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
  const [guestResponses, setGuestResponses] = useState([]);
  const [eventName, setEventName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [filterDomain, setFilterDomain] = useState("");
  const [loadError, setLoadError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) Obtener respuestas de militantes
        const resp = await adminAPI.getEventResponses(id);
        if (cancelled) return;
        setResponses(resp);
        setLoadError("");

        // 2) Obtener título del evento
        const ev = await adminAPI.getEvent(id);
        if (!cancelled) {
          setEventName(ev.title);
          setIsPublic(ev.visibility === "public");
        }

        // 3) Respuestas de visitantes (solo tienen sentido en eventos públicos)
        if (ev.visibility === "public") {
          const guests = await adminAPI.getEventGuestResponses(id);
          if (!cancelled) setGuestResponses(guests);
        }

      } catch (e) {
        console.error("Error cargando respuestas", e);
        if (cancelled) return;

        const message = e?.message || "";
        if (message.startsWith("HTTP 404")) {
          setLoadError("Este evento ya no existe. Puede que haya sido eliminado.");
        } else if (message.startsWith("HTTP 403")) {
          setLoadError("No tienes permiso para ver las respuestas de este evento.");
        } else {
          setLoadError("No se pudieron cargar las respuestas del evento.");
        }
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

  // Los visitantes se resumen aparte: no son militantes y hay que poder
  // distinguirlos al contar la asistencia.
  const guestSummary = useMemo(() => {
    let gsi = 0;
    let gno = 0;
    let companions = 0;
    for (const g of guestResponses) {
      const a = normalizeAnswer(g.answer);
      if (a === "si") {
        gsi++;
        companions += Number(g.companions || 0);
      } else if (a === "no") {
        gno++;
      }
    }
    return { si: gsi, no: gno, companions };
  }, [guestResponses]);

  if (loadError) {
    return (
      <Box p="lg">
        <Button mb="md" variant="outline" onClick={() => navigate("/admin")}>
          Volver
        </Button>

        <Title order={2} mb="lg">
          Respuestas del evento
        </Title>

        <Card shadow="sm" p="lg" style={{ background: "#fff5f5" }}>
          <Text c="red">{loadError}</Text>
        </Card>
      </Box>
    );
  }

  return (
    <Box p="lg">
      <Button mb="md" variant="outline" onClick={() => navigate("/admin")}>
        Volver
      </Button>

      <Title order={2} mb="lg">
        Respuestas del evento {eventName || "(cargando...)"}
      </Title>

      <TextInput
        placeholder="Filtrar por colectivo"
        value={filterDomain}
        onChange={(e) => setFilterDomain(e.target.value)}
        mb="lg"
      />

      {/* ========================================
          RESUMEN DE VOTOS (militancia y visitantes por separado)
         ======================================== */}
      <Card shadow="sm" p="lg" mb="lg" style={{ background: "#eef6ff" }}>
        <Title order={4} mb="sm">Resumen de votos</Title>

        <Text fw={600} mt="xs">Militancia</Text>
        <Text><b>Sí:</b> {si}</Text>
        <Text><b>No:</b> {no}</Text>
        <Text><b>+ Simpas:</b> {simpas}</Text>
        <Text c="dimmed" size="sm">Subtotal asistencia: {si + simpas}</Text>

        {isPublic && (
          <>
            <Text fw={600} mt="md">Visitantes (sin cuenta)</Text>
            <Text><b>Sí:</b> {guestSummary.si}</Text>
            <Text><b>No:</b> {guestSummary.no}</Text>
            <Text><b>+ Acompañantes:</b> {guestSummary.companions}</Text>
            <Text c="dimmed" size="sm">Subtotal asistencia: {guestSummary.si + guestSummary.companions}</Text>
          </>
        )}

        <Text fw={700} mt="md">
          Asistencia total: {si + simpas + (isPublic ? guestSummary.si + guestSummary.companions : 0)}
        </Text>
      </Card>

      {/* ========================================
          RESPUESTAS DE VISITANTES
         ======================================== */}
      {isPublic && (
        <Card shadow="sm" p="lg" mb="lg">
          <Title order={4} mb="sm">Visitantes sin cuenta ({guestResponses.length})</Title>
          {guestResponses.length === 0 ? (
            <Text size="sm" c="dimmed">Ningún visitante ha respondido todavía.</Text>
          ) : (
            guestResponses.map((g) => (
              <Text key={g.id} size="sm">
                {g.guest_name || "Anónimo"} — <b>{formatRespuesta(g.answer)}</b>
                {g.companions > 0 && ` · +${g.companions} acompañante(s)`}
              </Text>
            ))
          )}
        </Card>
      )}

      <Title order={4} mb="sm">Militancia</Title>
      {filteredResponses.length === 0 && (
        <Text>No hay respuestas de militantes todavía.</Text>
      )}

      {filteredResponses.map((r, idx) => (
        <Card key={r.user_id ?? idx} mt="md" shadow="sm" p="lg">
          <Text fw={600}>{r.user_full_name}</Text>
          <Text c="dimmed" size="sm">
            Colectivo: {r.user_domain || "-"}
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
