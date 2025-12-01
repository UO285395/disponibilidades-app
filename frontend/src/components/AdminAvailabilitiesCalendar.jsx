import { useEffect, useState, useMemo } from "react";
import { adminAPI } from "../api/adminApi.js";
import {
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

// ============================================
// COMPONENTE
// ============================================
export default function AdminAvailabilitiesCalendar() {
  const [rows, setRows] = useState([]);
  const [filterCode, setFilterCode] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalUsers, setModalUsers] = useState([]);
  const [modalSlot, setModalSlot] = useState("");

  // control de semana actual (0 = actual, 1 = siguiente)
  const [weekOffset, setWeekOffset] = useState(0);

  // cargar disponibilidades
  useEffect(() => {
    (async () => {
      try {
        const data = await adminAPI.listAvailabilities();
        setRows(data);
      } catch (e) {
        console.error("Error cargando disponibilidades", e);
      }
    })();
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

  // semana actual / siguiente
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const baseWeekStart = startOfWeek(today);
  const weekStart = useMemo(
    () => new Date(baseWeekStart.getTime() + weekOffset * 7 * 86400000),
    [baseWeekStart, weekOffset]
  );

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // obtener filas solo de la semana visible
  const weekRows = useMemo(() => {
    return filteredByEmail.filter((r) => {
      if (!r.date) return false;
      const d = new Date(r.date);
      d.setHours(0, 0, 0, 0);
      return d >= weekStart && d < weekEnd;
    });
  }, [filteredByEmail, weekStart, weekEnd]);

  // días de la semana
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const hours = Array.from({ length: 14 }, (_, i) => i + 8); // 08 a 21

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

    return slotCounts
      .filter((s) => s.count === maxVal)
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
        Disponibilidades (Semana actual y siguiente)
      </Title>

      {/* Filtro por dominio */}
      <TextInput
        placeholder="Filtrar por dominio (ej: gmail.com)"
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
          disabled={weekOffset === 1}
          onClick={() => setWeekOffset((v) => v + 1)}
        >
          Semana siguiente
        </Button>
      </Group>

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
        <Table withColumnBorders striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Hora</Table.Th>
              {days.map((d) => (
                <Table.Th key={d.toISOString()}>
                  {d.toLocaleDateString("es-ES")}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {hours.map((h) => (
              <Table.Tr key={h}>
                <Table.Td>{pad2(h)}:00-{pad2(h + 1)}:00</Table.Td>

                {days.map((d) => {
                  const date = formatISO(d);
                  const key = `${date}-${h}`;
                  const count = cellMap[key]?.length || 0;
                  const isBest = bestMatchKeys.has(key);

                  return (
                    <Table.Td
                      key={key}
                      onClick={() => count > 0 && openSlotUsers(date, h)}
                      style={{
                        cursor: count > 0 ? "pointer" : "default",
                        background: isBest
                          ? "#ffb3b3"
                          : count > 0
                          ? "#d3f5ff"
                          : undefined,
                        textAlign: "center",
                        fontWeight: 600,
                      }}
                    >
                      {count > 0 ? count : ""}
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
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
                <b>{u.user}</b> — {u.email}
              </List.Item>
            ))}
          </List>
        )}
      </Modal>
    </div>
  );
}
