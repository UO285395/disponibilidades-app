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
} from "@mantine/core";

function pad2(n) {
  return n.toString().padStart(2, "0");
}

// Formato DD/MM con fallback
function formatDay(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) {
    // Si por lo que sea no parsea, muestra el raw para depurar
    return String(d);
  }
  return dt.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
  });
}

export default function AdminAvailabilitiesCalendar() {
  const [rows, setRows] = useState([]);
  const [filterCode, setFilterCode] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalUsers, setModalUsers] = useState([]);
  const [modalSlot, setModalSlot] = useState("");

  // -------------------------------------
  // CARGAR DATOS
  // -------------------------------------
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

  // -------------------------------------
  // FILTRO POR CÓDIGO (dominio email)
  // -------------------------------------
  const filtered = useMemo(() => {
    if (!filterCode.trim()) return rows;

    const code = filterCode.toLowerCase();

    return rows.filter((r) => {
      const domain = r.email.split("@")[1]?.toLowerCase() || "";
      return domain.includes(code);
    });
  }, [rows, filterCode]);

  // -------------------------------------
  // FILTRAR TAMBIÉN POR FECHAS FUTURAS / HOY
  // (evitar que slots pasados entren en el bestMatch)
  // -------------------------------------
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const filteredFuture = useMemo(() => {
    return filtered.filter((r) => {
      if (!r.date) return false;
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) return false;
      d.setHours(0, 0, 0, 0);
      return d >= today;
    });
  }, [filtered, today]);

  // -------------------------------------
  // DÍAS ÚNICOS DEL CALENDARIO (solo futuros)
  // -------------------------------------
  const days = useMemo(() => {
    const unique = [...new Set(filteredFuture.map((r) => r.date))].filter(
      Boolean
    );
    return unique.sort();
  }, [filteredFuture]);

  const hours = Array.from({ length: 14 }, (_, i) => i + 8); // 08 → 21

  // -------------------------------------
  // MAPA celda → lista de usuarios (solo futuros)
  // key: "YYYY-MM-DD-HH"
  // -------------------------------------
  const cellMap = useMemo(() => {
    const map = {};

    for (const r of filteredFuture) {
      if (!r.date || !r.start_time || !r.end_time) continue;

      const startHour = Number(r.start_time.slice(0, 2));
      const endHour = Number(r.end_time.slice(0, 2));

      for (let h = startHour; h < endHour; h++) {
        const key = `${r.date}-${h}`;
        if (!map[key]) map[key] = [];
        map[key].push({ user: r.user, email: r.email });
      }
    }

    return map;
  }, [filteredFuture]);

  // -------------------------------------
  // BEST MATCH (todas las franjas empatadas)
  // igual que en AdminAvailabilities: personas únicas por slot
  // -------------------------------------
  const bestMatches = useMemo(() => {
    const entries = Object.entries(cellMap); // [key, usuarios[]]

    if (entries.length === 0) return [];

    // Contador por slot basado en emails únicos
    const slotCounts = entries.map(([key, users]) => {
      const emailSet = new Set(users.map((u) => u.email));
      return { key, count: emailSet.size };
    });

    const maxVal = Math.max(...slotCounts.map((s) => s.count));
    if (maxVal === 0) return [];

    return slotCounts
      .filter((s) => s.count === maxVal)
      .map(({ key, count }) => {
        const [day, hourStr] = key.split("-");
        const hour = Number(hourStr);
        return {
          day,
          hour,
          count,
          slot: `${formatDay(day)} ${pad2(hour)}:00-${pad2(hour + 1)}:00`,
        };
      });
  }, [cellMap]);

  // Set de claves "día-hora" que son bestMatch → para pintar en rojo el calendario
  const bestMatchKeys = useMemo(() => {
    return new Set(bestMatches.map((b) => `${b.day}-${b.hour}`));
  }, [bestMatches]);

  // -------------------------------------
  // MODAL: mostrar usuarios
  // -------------------------------------
  function openSlotUsers(date, hour) {
    const key = `${date}-${hour}`;
    const users = cellMap[key] || [];

    setModalSlot(`${formatDay(date)} ${pad2(hour)}:00-${pad2(hour + 1)}:00`);
    setModalUsers(users);
    setModalOpen(true);
  }

  // -------------------------------------
  // RENDER
  // -------------------------------------
  return (
    <div>
      <Title order={3} mb="md">
        Disponibilidades semanales
      </Title>

      {/* FILTRO */}
      <TextInput
        placeholder="Filtrar por código (dominio del email)"
        value={filterCode}
        onChange={(e) => setFilterCode(e.target.value)}
        mb="lg"
      />

      {/* BEST MATCH: resumen arriba, como en el otro componente */}
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

      {/* CALENDARIO */}
      <Card shadow="md" p="lg">
        <Table withColumnBorders striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Hora</Table.Th>
              {days.map((d) => (
                <Table.Th key={d}>{formatDay(d)}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {hours.map((h) => (
              <Table.Tr key={h}>
                <Table.Td>
                  {pad2(h)}:00-{pad2(h + 1)}:00
                </Table.Td>

                {days.map((d) => {
                  const key = `${d}-${h}`;
                  const count = cellMap[key]?.length || 0;
                  const isBest = bestMatchKeys.has(key);

                  return (
                    <Table.Td
                      key={key}
                      onClick={() => count > 0 && openSlotUsers(d, h)}
                      style={{
                        cursor: count > 0 ? "pointer" : "default",
                        background: isBest
                          ? "#ffb3b3" // 🔴 BEST MATCH → rojo claro
                          : count > 0
                          ? "#d3f5ff" // azul para celdas con gente
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

      {/* MODAL */}
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Usuarios disponibles (${modalSlot})`}
      >
        {modalUsers.length === 0 ? (
          <Text>No hay usuarios</Text>
        ) : (
          <List spacing="xs" size="sm" center>
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
