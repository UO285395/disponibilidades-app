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
  Button
} from "@mantine/core";

function pad2(n) {
  return n.toString().padStart(2, "0");
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
  // FILTRO POR CÓDIGO
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
  // CALENDARIO SEMANAL
  // -------------------------------------
  const days = useMemo(() => {
    const unique = [...new Set(filtered.map((r) => r.date))];
    return unique.sort();
  }, [filtered]);

  const hours = Array.from({ length: 14 }, (_, i) => i + 8); // 08 → 21

  // -------------------------------------
  // MAPA: celda → lista de usuarios
  // -------------------------------------
  const cellMap = useMemo(() => {
    const map = {}; // key: "YYYY-MM-DD-HH" → array de usuarios

    for (const r of filtered) {
      const startHour = Number(r.start_time.slice(0, 2));
      const endHour = Number(r.end_time.slice(0, 2));

      for (let h = startHour; h < endHour; h++) {
        const key = `${r.date}-${h}`;
        if (!map[key]) map[key] = [];
        map[key].push({ user: r.user, email: r.email });
      }
    }
    return map;
  }, [filtered]);

  // -------------------------------------
  // BEST MATCH (TODAS LAS FRANJAS EMPATADAS)
  // -------------------------------------
  const bestMatches = useMemo(() => {
    const entries = Object.entries(cellMap); // [key, users[]]

    if (entries.length === 0) return [];

    const maxVal = Math.max(...entries.map(([_, arr]) => arr.length));
    if (maxVal === 0) return [];

    return entries
      .filter(([_, arr]) => arr.length === maxVal)
      .map(([key, arr]) => {
        const [day, hour] = key.split("-");
        const slot = `${day} ${pad2(hour)}:00-${pad2(
          Number(hour) + 1
        )}:00`;

        return { slot, count: arr.length };
      });
  }, [cellMap]);

  // -------------------------------------
  // ACCIÓN: mostrar usuarios en modal
  // -------------------------------------
  function openSlotUsers(date, hour) {
    const key = `${date}-${hour}`;
    const users = cellMap[key] || [];

    setModalSlot(`${date} ${pad2(hour)}:00-${pad2(Number(hour) + 1)}:00`);
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

      {/* BEST MATCH */}
      {bestMatches.length > 0 && (
        <Card shadow="md" p="md" mb="lg" style={{ background: "#e8f7e4" }}>
          <Text fw={700}>
            Mejor coincidencia: {bestMatches[0].count} personas
          </Text>

          {bestMatches.map((b, i) => (
            <Badge key={i} color="green" mt="xs">
              {b.slot}
            </Badge>
          ))}
        </Card>
      )}

      {/* CALENDARIO */}
      <Card shadow="md" p="lg">
        <Table withColumnBorders striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Hora</Table.Th>
              {days.map((d) => (
                <Table.Th key={d}>{d}</Table.Th>
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

                  return (
                    <Table.Td
                      key={key}
                      onClick={() =>
                        count > 0 && openSlotUsers(d, h)
                      }
                      style={{
                        cursor: count > 0 ? "pointer" : "default",
                        background: count > 0 ? "#d3f5ff" : undefined,
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

      {/* MODAL DE USUARIOS */}
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
