import { useCallback, useEffect, useState, useMemo } from "react";
import { adminAPI } from "../api/adminApi.js";
import {
  Alert,
  Card,
  Title,
  Text,
  TextInput,
  Badge,
  Modal,
  List,
  Table,
  Group,
  Button,
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
  return d.toISOString().slice(0, 10);
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

// ============================================
// COMPONENTE
// ============================================
export default function AdminAvailabilitiesCalendar() {
  const [rows, setRows] = useState([]);
  const [filterCode, setFilterCode] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalUsers, setModalUsers] = useState([]);
  const [modalSlot, setModalSlot] = useState("");

  // control de semana visible (0 = actual, 1 = siguiente, 2 = posterior)
  const [weekOffset, setWeekOffset] = useState(0);
  const MAX_WEEK_OFFSET = 2;

  // cargar disponibilidades
  useEffect(() => {
    const loadAvailabilities = async () => {
      try {
        const data = await adminAPI.listAvailabilities();
        setRows(data);
      } catch (e) {
        console.error("Error cargando disponibilidades", e);
      }
    };

    loadAvailabilities();

    const intervalId = window.setInterval(() => {
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
  }, []);

  // filtrado por dominio
  const filteredByEmail = useMemo(() => {
    if (!filterCode.trim()) return rows;
    const code = filterCode.toLowerCase();
    return rows.filter((r) => {
      const domain = r.email.split("@")[1]?.toLowerCase() || "";
      return domain.includes(code);
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


  // obtener filas solo de la semana visible
  const weekRows = useMemo(() => {
    return filteredByEmail.filter((r) => {
      if (!r.date) return false;
      if (isPastDate(r.date)) return false;
      const d = new Date(r.date);
      d.setHours(0, 0, 0, 0);
      return d >= weekStart && d < weekEnd;
    });
  }, [filteredByEmail, isPastDate, weekStart, weekEnd]);

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
      if (!r.date || !r.start_time || !r.end_time) continue;

      const startHour = Number(r.start_time.slice(0, 2));
      const endHour = Number(r.end_time.slice(0, 2));

      for (let h = startHour; h < endHour; h++) {
        const key = `${r.date}-${h}`;
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

      {/* Filtro por colectivo */}
      <TextInput
        placeholder="Filtrar por colectivo"
        value={filterCode}
        onChange={(e) => setFilterCode(e.target.value)}
        mb="lg"
      />

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
        Los días anteriores a hoy se consideran vencidos: no se incluyen en los conteos y se muestran bloqueados en gris.
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

      {/* Calendario */}
<Card shadow="md" p="lg">
  <div
    style={{
      overflowX: "auto",
      WebkitOverflowScrolling: "touch",
    }}
  >
    <Table
      withColumnBorders
      striped
      highlightOnHover
      style={{
        minWidth: 900, // fuerza scroll en móvil
      }}
    >
<Table.Thead>
            <Table.Tr>
             <Table.Th>
  Hora
</Table.Th>

              {days.map((d) => {
                const date = formatISO(d);
                const expired = isPastDate(date);

                return (
                <Table.Th key={d.toISOString()} style={{ opacity: expired ? 0.6 : 1 }}>
                 {d.toLocaleDateString("es-ES", {
  weekday: "short",
  day: "2-digit",
})}
                  {expired ? " · vencido" : ""}
                </Table.Th>
              );})}
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {hours.map((h) => (
              <Table.Tr key={h}>
                <Table.Td  style={{textAlign: "center"}}>
  {pad2(h)}:00 - {pad2(h + 1)}:00
</Table.Td>

                {days.map((d) => {
                  const date = formatISO(d);
                  const expired = isPastDate(date);
                  const key = `${date}-${h}`;
                  const count = cellMap[key]?.length || 0;
                  const isBest = bestMatchKeys.has(key);

                  return (
                    <Table.Td
                      key={key}
                      onClick={() => !expired && count > 0 && openSlotUsers(date, h)}
                      style={{
                        cursor: !expired && count > 0 ? "pointer" : "default",
                        background: expired
                          ? "#f1f3f5"
                          : isBest
                          ? "#ffb3b3"
                          : count > 0
                          ? "#d3f5ff"
                          : undefined,
                        color: expired ? "#868e96" : undefined,
                        textAlign: "center",
                        fontWeight: 600,
                      }}
                    >
                      {expired ? "Vencido" : count > 0 ? count : ""}
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        </div>
      </Card>

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
