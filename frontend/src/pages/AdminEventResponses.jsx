import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminAPI } from "../api/adminApi.js";
import {
  Card, Title, Text, Button, Box, TextInput, Group, Badge, SimpleGrid, Alert,
} from "@mantine/core";
import { IconArrowLeft, IconDownload, IconAlertTriangle } from "@tabler/icons-react";
import { downloadCsv } from "../utils/csv.js";

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

function formatHours(hours) {
  return (hours || []).map((h) => `${h}-${h + 1}`).join(", ");
}

// Recuento de respondientes distintos por hora (8-23), combinando militantes y visitantes.
function summarizeHourCounts(availability, guestAvailability) {
  const counts = new Map();
  [...availability, ...guestAvailability].forEach((entry) => {
    (entry.hours || []).forEach((hour) => {
      counts.set(hour, (counts.get(hour) || 0) + 1);
    });
  });
  return Array.from({ length: 16 }, (_, i) => i + 8).map((hour) => ({
    hour,
    count: counts.get(hour) || 0,
  }));
}

export default function AdminEventResponses() {
  const { id } = useParams();
  const [responses, setResponses] = useState([]);
  const [guestResponses, setGuestResponses] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [guestAvailability, setGuestAvailability] = useState([]);
  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState("participativo");
  const [isPublic, setIsPublic] = useState(false);
  const [filterDomain, setFilterDomain] = useState("");
  const [loadError, setLoadError] = useState("");
  const navigate = useNavigate();

  const isAvailabilityEvent = eventType === "disponibilidad";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) Obtener título y tipo del evento
        const ev = await adminAPI.getEvent(id);
        if (cancelled) return;
        setEventName(ev.title);
        setEventType(ev.event_type || "participativo");
        setIsPublic(ev.visibility === "public");
        setLoadError("");

        if (ev.event_type === "disponibilidad") {
          // 2) Franjas horarias de militantes
          const slots = await adminAPI.getEventAvailability(id);
          if (!cancelled) setAvailability(slots);

          // 3) Franjas horarias de visitantes (solo eventos públicos)
          if (ev.visibility === "public") {
            const guestSlots = await adminAPI.getEventGuestAvailability(id);
            if (!cancelled) setGuestAvailability(guestSlots);
          }
          return;
        }

        // 2) Obtener respuestas de militantes
        const resp = await adminAPI.getEventResponses(id);
        if (!cancelled) setResponses(resp);

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

  const filteredAvailability = useMemo(() => {
    const domainSearch = filterDomain.trim().toLowerCase();
    if (!domainSearch) return availability;

    return availability.filter((a) => {
      const domain = String(a.user_domain || "").toLowerCase();
      return domain.includes(domainSearch);
    });
  }, [availability, filterDomain]);

  const hourCounts = useMemo(
    () => summarizeHourCounts(filteredAvailability, isPublic ? guestAvailability : []),
    [filteredAvailability, guestAvailability, isPublic]
  );

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

  function exportCsv() {
    if (isAvailabilityEvent) {
      const rows = [
        ...filteredAvailability.map((a) => ({
          tipo: "Militante",
          nombre: a.user_full_name,
          colectivo: a.user_domain || "",
          franjas: formatHours(a.hours),
        })),
        ...(isPublic ? guestAvailability.map((g) => ({
          tipo: "Visitante",
          nombre: g.guest_name || "Anónimo",
          colectivo: "",
          franjas: formatHours(g.hours),
        })) : []),
      ];
      const columns = [
        { key: "tipo", label: "Tipo" },
        { key: "nombre", label: "Nombre" },
        { key: "colectivo", label: "Colectivo" },
        { key: "franjas", label: "Franjas horarias" },
      ];
      const safeName = (eventName || "evento").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      downloadCsv(`disponibilidad-${safeName}.csv`, rows, columns);
      return;
    }

    const rows = [
      ...filteredResponses.map((r) => ({
        tipo: "Militante",
        nombre: r.user_full_name,
        colectivo: r.user_domain || "",
        respuesta: formatRespuesta(r.answer),
        acompanantes: r.companions_count ?? 0,
        justificacion: r.justification || "",
      })),
      ...(isPublic ? guestResponses.map((g) => ({
        tipo: "Visitante",
        nombre: g.guest_name || "Anónimo",
        colectivo: "",
        respuesta: formatRespuesta(g.answer),
        acompanantes: g.companions ?? 0,
        justificacion: "",
      })) : []),
    ];
    const columns = [
      { key: "tipo", label: "Tipo" },
      { key: "nombre", label: "Nombre" },
      { key: "colectivo", label: "Colectivo" },
      { key: "respuesta", label: "Respuesta" },
      { key: "acompanantes", label: "Acompañantes" },
      { key: "justificacion", label: "Justificación" },
    ];
    const safeName = (eventName || "evento").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    downloadCsv(`respuestas-${safeName}.csv`, rows, columns);
  }

  const totalMilitants = filteredResponses.length;
  const participationPct = totalMilitants > 0 ? Math.round((si / totalMilitants) * 100) : 0;

  if (loadError) {
    return (
      <Box p="lg">
        <Button mb="md" variant="light" leftSection={<IconArrowLeft size={18} />} onClick={() => navigate("/admin")}>
          Volver
        </Button>

        <Title order={2} mb="lg">
          Respuestas del evento
        </Title>

        <Alert color="red" icon={<IconAlertTriangle size={18} />}>{loadError}</Alert>
      </Box>
    );
  }

  const hasAnyResponse = isAvailabilityEvent
    ? filteredAvailability.length > 0 || guestAvailability.length > 0
    : filteredResponses.length > 0 || guestResponses.length > 0;

  return (
    <Box p="lg">
      <Group justify="space-between" mb="md" wrap="nowrap">
        <Button variant="light" leftSection={<IconArrowLeft size={18} />} onClick={() => navigate("/admin")}>
          Volver
        </Button>
        <Button
          variant="light"
          leftSection={<IconDownload size={18} />}
          disabled={!hasAnyResponse}
          onClick={exportCsv}
        >
          Exportar CSV
        </Button>
      </Group>

      <Title order={2} mb="lg">
        Respuestas del evento {eventName || "(cargando...)"}
      </Title>

      <TextInput
        placeholder="Filtrar por colectivo"
        value={filterDomain}
        onChange={(e) => setFilterDomain(e.target.value)}
        mb="lg"
      />

      {isAvailabilityEvent ? (
        <>
          {/* ========================================
              RESUMEN POR HORA (militantes + visitantes)
             ======================================== */}
          <Card withBorder shadow="sm" p="lg" mb="lg">
            <Title order={4} mb="md">Disponibilidad por franja</Title>
            <Group gap="xs">
              {hourCounts.map(({ hour, count }) => (
                <Badge key={hour} color={count > 0 ? "teal" : "gray"} variant={count > 0 ? "filled" : "light"}>
                  {hour}-{hour + 1}h: {count}
                </Badge>
              ))}
            </Group>
            <Text size="sm" c="dimmed" mt="md">
              Militantes con disponibilidad: {filteredAvailability.length}
              {isPublic && ` · Visitantes con disponibilidad: ${guestAvailability.length}`}
            </Text>
          </Card>

          {/* ========================================
              VISITANTES SIN CUENTA
             ======================================== */}
          {isPublic && (
            <Card shadow="sm" p="lg" mb="lg">
              <Title order={4} mb="sm">Visitantes sin cuenta ({guestAvailability.length})</Title>
              {guestAvailability.length === 0 ? (
                <Text size="sm" c="dimmed">Ningún visitante ha indicado disponibilidad todavía.</Text>
              ) : (
                guestAvailability.map((g, idx) => (
                  <Text key={idx} size="sm">
                    {g.guest_name || "Anónimo"} — <b>{formatHours(g.hours)}</b>
                  </Text>
                ))
              )}
            </Card>
          )}

          <Title order={4} mb="sm">Militancia</Title>
          {filteredAvailability.length === 0 && (
            <Text>No hay disponibilidad de militantes todavía.</Text>
          )}

          {filteredAvailability.map((a, idx) => (
            <Card key={a.user_id ?? idx} mt="md" shadow="sm" p="lg">
              <Text fw={600}>{a.user_full_name}</Text>
              <Text c="dimmed" size="sm">
                Colectivo: {a.user_domain || "-"}
              </Text>
              <Text>
                <b>Franjas:</b> {formatHours(a.hours)}
              </Text>
            </Card>
          ))}
        </>
      ) : (
        <>
          {/* ========================================
              RESUMEN DE VOTOS (militancia y visitantes por separado)
             ======================================== */}
          <Card withBorder shadow="sm" p="lg" mb="lg">
            <Title order={4} mb="md">Resumen de votos</Title>

            <SimpleGrid cols={{ base: 2, sm: isPublic ? 4 : 2 }} spacing="md">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Militancia</Text>
                <Group gap="xs" mt={4}>
                  <Badge color="teal" variant="light" size="lg">Sí {si}</Badge>
                  <Badge color="red" variant="light" size="lg">No {no}</Badge>
                </Group>
                <Text size="sm" c="dimmed" mt={6}>+ Simpas: {simpas}</Text>
                <Text size="sm" c="dimmed">Participación: {participationPct}%</Text>
                <Text size="sm" fw={600} mt={2}>Asistencia: {si + simpas}</Text>
              </div>

              {isPublic && (
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Visitantes</Text>
                  <Group gap="xs" mt={4}>
                    <Badge color="teal" variant="light" size="lg">Sí {guestSummary.si}</Badge>
                    <Badge color="red" variant="light" size="lg">No {guestSummary.no}</Badge>
                  </Group>
                  <Text size="sm" c="dimmed" mt={6}>+ Acompañantes: {guestSummary.companions}</Text>
                  <Text size="sm" fw={600} mt={2}>Asistencia: {guestSummary.si + guestSummary.companions}</Text>
                </div>
              )}
            </SimpleGrid>

            <Text fw={700} mt="md" size="lg">
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
        </>
      )}
    </Box>
  );
}
