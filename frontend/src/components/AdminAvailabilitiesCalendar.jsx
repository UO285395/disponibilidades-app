import { useCallback, useEffect, useState, useMemo } from "react";
import { adminAPI } from "../api/adminApi.js";
import OrgUnitSelect from "./OrgUnitSelect.jsx";
import {
  Alert,
  Card,
  Title,
  Text,
  TextInput,
  Badge,
  Modal,
  List,
  Group,
  Button,
  Stack,
} from "@mantine/core";

// ============================================
// Helpers
// ============================================
function pad2(n) {
  return n.toString().padStart(2, "0");
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // lunes
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDay(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
}

function parseISODate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(value) {
  if (!value) return "";

  // Handle values like YYYY-MM-DD, YYYY-M-D or full ISO datetime.
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) {
    return formatISO(direct);
  }

  const text = String(value).trim();
  const datePart = text.includes("T") ? text.split("T")[0] : text;
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return "";

  return formatISO(new Date(year, month - 1, day));
}

function parseHour(value) {
  if (!value) return Number.NaN;
  const hour = Number(String(value).split(":")[0]);
  return Number.isInteger(hour) ? hour : Number.NaN;
}

// ============================================
// COMPONENTE
// ============================================
export default function AdminAvailabilitiesCalendar() {
  const [rows, setRows] = useState([]);
  const [filterCode, setFilterCode] = useState("");
  const [unitId, setUnitId] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalUsers, setModalUsers] = useState([]);
  const [modalSlot, setModalSlot] = useState("");

  // control de semana visible (0 = actual, 1 = siguiente, 2 = posterior)
  const [weekOffset, setWeekOffset] = useState(0);
  const MAX_WEEK_OFFSET = 2;

  // cargar disponibilidades (el filtro por unidad se resuelve en servidor,
  // incluyendo toda la rama de la unidad elegida)
  useEffect(() => {
    const loadAvailabilities = async () => {
      try {
        const data = await adminAPI.listAvailabilities(unitId ? Number(unitId) : null);
        setRows(data);
      } catch (e) {
        console.error("Error cargando disponibilidades", e);
      }
    };

    loadAvailabilities();

    // Solo se sondea cuando la pantalla está visible: antes el intervalo seguía
    // corriendo con la app en segundo plano, gastando datos y batería en la APK
    // para nada.
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      loadAvailabilities();
    }, 15000);

    function handleVisibilityOrFocus() {
      if (!document.hidden) {
        loadAvailabilities();
      }
    }

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [unitId]);

  // El ámbito (unidad) ya viene filtrado del servidor por rama. Aquí solo
  // queda el filtro por etiqueta de grupo, que es transversal a la estructura.
  const filteredRows = useMemo(() => {
    if (!filterCode.trim()) return rows;
    const code = filterCode.toLowerCase();
    return rows.filter((r) => {
      const tags = Array.isArray(r.group_tags)
        ? r.group_tags
        : String(r.group_tag || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
      return tags.some((tag) => tag.toLowerCase().includes(code));
    });
  }, [rows, filterCode]);

  // semana actual / siguiente / posterior
  const today = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, []);

  const isPastDate = useCallback(
    (date) => parseISODate(date) < today,
    [today]
  );

  const baseWeekStart = startOfWeek(today);
const weekStart = useMemo(() => {
  const d = new Date(baseWeekStart);
  d.setDate(d.getDate() + weekOffset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}, [baseWeekStart, weekOffset]);


  const weekEnd = useMemo(() => {
  const d = new Date(weekStart);
  d.setDate(weekStart.getDate() + 7);
  d.setHours(0, 0, 0, 0);
  return d;
}, [weekStart]);


  const normalizedRows = useMemo(() => {
    return filteredRows
      .map((r) => {
        const dateKey = toDateKey(r.date);
        const startHour = parseHour(r.start_time);
        const endHour = parseHour(r.end_time);

        return {
          ...r,
          dateKey,
          startHour,
          endHour,
        };
      })
      .filter(
        (r) =>
          r.dateKey &&
          Number.isInteger(r.startHour) &&
          Number.isInteger(r.endHour) &&
          r.startHour >= 0 &&
          r.endHour <= 24 &&
          r.startHour < r.endHour
      );
  }, [filteredRows]);

  // obtener filas solo de la semana visible
  const weekRows = useMemo(() => {
    return normalizedRows.filter((r) => {
      if (isPastDate(r.dateKey)) return false;
      const d = parseISODate(r.dateKey);
      d.setHours(0, 0, 0, 0);
      return d >= weekStart && d < weekEnd;
    });
  }, [normalizedRows, isPastDate, weekStart, weekEnd]);

  // días de la semana
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const hours = Array.from({ length: 16 }, (_, i) => i + 8); // 08 a 23

  // ============================================
  // MAPA CELDA (date-hour → lista usuarios)
  // ============================================
  const cellMap = useMemo(() => {
    const map = {};

    for (const r of weekRows) {
      for (let h = r.startHour; h < r.endHour; h++) {
        const key = `${r.dateKey}-${h}`;
        if (!map[key]) map[key] = [];

        // evita duplicados por persona
        if (!map[key].some((u) => u.email === r.email)) {
          map[key].push({ user: r.user, email: r.email });
        }
      }
    }

    return map;
  }, [weekRows]);

  // ============================================
  // BEST MATCH (franjas más votadas)
  // ============================================
  const bestMatches = useMemo(() => {
    const entries = Object.entries(cellMap);
    if (entries.length === 0) return [];

    const slotCounts = entries.map(([key, users]) => {
      const uniqueUsers = new Set(users.map((u) => u.email));
      return { key, count: uniqueUsers.size };
    });

    const maxVal = Math.max(...slotCounts.map((s) => s.count));
    if (maxVal === 0) return [];

    // Tomar solo las primeras 5 franjas con máximo número de personas
    return slotCounts
      .filter((s) => s.count === maxVal)
      .slice(0, 5)
      .map(({ key, count }) => {
        const lastDash = key.lastIndexOf("-");
        const day = key.slice(0, lastDash);
        const hour = Number(key.slice(lastDash + 1));

        return {
          day,
          hour,
          count,
          slot: `${formatDay(day)} ${pad2(hour)}:00-${pad2(hour + 1)}:00`,
        };
      });
  }, [cellMap]);

  const bestMatchKeys = useMemo(
    () => new Set(bestMatches.map((b) => `${b.day}-${b.hour}`)),
    [bestMatches]
  );

  // Máximo de personas en una franja, para escalar el mapa de calor.
  const maxCount = useMemo(() => {
    let m = 0;
    for (const key in cellMap) m = Math.max(m, cellMap[key].length);
    return m;
  }, [cellMap]);

  // Solo días de hoy en adelante (no se muestran vencidos).
  const upcomingDays = useMemo(
    () => days.filter((d) => !isPastDate(formatISO(d))),
    [days, isPastDate]
  );

  // Estilo de cada franja según cuánta gente coincide (heatmap) y si es la mejor.
  function slotStyle(count, isBest) {
    if (count === 0) {
      return { background: "#f8f9fa", border: "1px solid #e9ecef", color: "#adb5bd" };
    }
    const intensity = maxCount > 0 ? count / maxCount : 0;
    if (isBest) {
      return { background: "#ffe3e3", border: "2px solid #ff8787", color: "#1f2328" };
    }
    return {
      background: `rgba(51, 154, 240, ${(0.15 + intensity * 0.55).toFixed(2)})`,
      border: "1px solid #a5d8ff",
      color: "#1f2328",
    };
  }

  // ============================================
  // MODAL USUARIOS
  // ============================================
  function openSlotUsers(date, hour) {
    const key = `${date}-${hour}`;
    const users = cellMap[key] || [];

    setModalSlot(`${formatDay(date)} ${pad2(hour)}:00-${pad2(hour + 1)}:00`);
    setModalUsers(users);
    setModalOpen(true);
  }

  // ============================================
  // RENDER
  // ============================================
  return (
    <div>
      <Title order={3} mb="md">
        Disponibilidades (Semana actual, siguiente y posterior)
      </Title>

      {/* Filtros: ámbito de la estructura (incluye su rama) y etiqueta */}
      <Group align="flex-end" mb="lg" grow>
        <OrgUnitSelect
          label="Ámbito"
          description="Incluye las estructuras que dependen de la elegida"
          placeholder="Todo mi ámbito"
          value={unitId}
          onChange={setUnitId}
        />
        <TextInput
          label="Etiqueta"
          placeholder="Filtrar por etiqueta (ej: organizador)"
          value={filterCode}
          onChange={(e) => setFilterCode(e.target.value)}
        />
      </Group>

      {/* Botones de semana */}
      <Group mb="md">
        <Button
          disabled={weekOffset === 0}
          onClick={() => setWeekOffset((v) => v - 1)}
        >
          Semana anterior
        </Button>
        <Button
          disabled={weekOffset === MAX_WEEK_OFFSET}
          onClick={() => setWeekOffset((v) => v + 1)}
        >
          Semana siguiente
        </Button>
      </Group>

      <Alert color="blue" mb="md">
        Solo se muestran los días de hoy en adelante. El número de cada franja es cuántas
        personas coinciden; el color resalta las más concurridas. Toca una franja para ver quiénes.
      </Alert>

      {/* Mejor coincidencia */}
      {bestMatches.length > 0 && (
        <Card shadow="md" p="md" mb="lg" style={{ background: "#e8f7e4" }}>
          <Text fw={700} mb="xs">
            Mejores coincidencias ({bestMatches[0].count} personas):
          </Text>

          <Group gap="xs" mt="xs">
            {bestMatches.map((b, i) => (
              <Badge key={i} color="green" size="lg">
                {b.slot}
              </Badge>
            ))}
          </Group>
        </Card>
      )}

      {/* Calendario: una tarjeta por día, franjas como mapa de calor. Sin scroll
          horizontal ni días vencidos, para que se lea bien en móvil. */}
      {upcomingDays.length === 0 ? (
        <Card shadow="md" p="lg">
          <Text c="dimmed">No hay días disponibles en esta semana.</Text>
        </Card>
      ) : (
        <Stack gap="md">
          {upcomingDays.map((d) => {
            const date = formatISO(d);
            return (
              <Card key={date} shadow="sm" withBorder p="md" radius="md">
                <Text fw={700} mb="sm" tt="capitalize">
                  {d.toLocaleDateString("es-ES", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                  })}
                </Text>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
                    gap: 8,
                  }}
                >
                  {hours.map((h) => {
                    const key = `${date}-${h}`;
                    const count = cellMap[key]?.length || 0;
                    const isBest = bestMatchKeys.has(key);
                    const clickable = count > 0;
                    const style = slotStyle(count, isBest);

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => clickable && openSlotUsers(date, h)}
                        disabled={!clickable}
                        title={count > 0 ? `${count} persona(s)` : "Sin disponibilidad"}
                        style={{
                          ...style,
                          borderRadius: 10,
                          minHeight: 56,
                          padding: "6px 4px",
                          textAlign: "center",
                          cursor: clickable ? "pointer" : "default",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 2,
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 600 }}>
                          {pad2(h)}-{pad2(h + 1)}
                        </span>
                        <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>
                          {count > 0 ? count : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Modal usuarios */}
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Usuarios disponibles (${modalSlot})`}
      >
        {modalUsers.length === 0 ? (
          <Text>No hay usuarios</Text>
        ) : (
          <List spacing="xs" size="sm">
            {modalUsers.map((u, i) => (
              <List.Item key={i}>
                <b>{u.user}</b>
              </List.Item>
            ))}
          </List>
        )}
      </Modal>
    </div>
  );
}
