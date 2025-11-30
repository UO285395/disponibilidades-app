import { useEffect, useState, useMemo } from "react";
import { adminAPI } from "../api/adminApi.js";
import { Card, Title, Text, TextInput, Badge, Group } from "@mantine/core";

export default function AdminAvailabilities() {
  const [rows, setRows] = useState([]);
  const [filterCode, setFilterCode] = useState("");

  // -------------------------------
  // CARGA DE DATOS
  // -------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await adminAPI.listAvailabilities();
        if (!cancelled) setRows(data);
      } catch (e) {
        console.error("Error cargando disponibilidades", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------
  // FILTRAR POR CÓDIGO
  // -------------------------------
  const filtered = useMemo(() => {
    if (!filterCode.trim()) return rows;

    const codeSearch = filterCode.toLowerCase();

    return rows.filter((r) => {
      const domain = r.email.split("@")[1]?.toLowerCase() || "";
      return domain.includes(codeSearch);
    });
  }, [rows, filterCode]);

  // -------------------------------
  // BEST MATCH: personas únicas por franja
  // -------------------------------
  const bestMatches = useMemo(() => {
    if (filtered.length === 0) return [];

    // key: "YYYY-MM-DD HH:00-HH+1:00" -> Set(emails)
    const counter = {};

    for (const r of filtered) {
      const startHour = Number(r.start_time.slice(0, 2));
      const endHour = Number(r.end_time.slice(0, 2));
      const day = r.date;
      const email = r.email;

      for (let h = startHour; h < endHour; h++) {
        const slot = `${day} ${String(h).padStart(2, "0")}:00-${String(
          h + 1
        ).padStart(2, "0")}:00`;

        if (!counter[slot]) {
          counter[slot] = new Set();
        }
        counter[slot].add(email); // persona única por franja
      }
    }

    const entries = Object.entries(counter);
    if (entries.length === 0) return [];

    // Tamaño máximo de set (nº de personas)
    const maxVal = Math.max(...entries.map(([_, set]) => set.size));
    if (maxVal === 0) return [];

    // Devolver TODAS las franjas empatadas al máximo
    return entries
      .filter(([_, set]) => set.size === maxVal)
      .map(([slot, set]) => ({
        slot,
        count: set.size,
      }));
  }, [filtered]);

  return (
    <div>
      <Title order={3} mb="md">
        Disponibilidades semanales
      </Title>

      {/* Filtro por código */}
      <TextInput
        placeholder="Filtrar por colectivo (código del email)"
        value={filterCode}
        onChange={(e) => setFilterCode(e.target.value)}
        mb="lg"
      />

      {/* Mejores franjas */}
      {bestMatches.length > 0 && (
        <Card shadow="md" p="md" mb="lg" style={{ background: "#e8f7e4" }}>
          <Text fw={700} mb="xs">
            Mejores coincidencias ( {bestMatches[0].count} personas):
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

      {/* Listado de disponibilidades (ya filtrado) */}
      {filtered.length === 0 && (
        <Text size="sm" c="dimmed">
          No hay disponibilidades que coincidan con el filtro.
        </Text>
      )}

      {filtered.map((r) => (
        <Card key={r.id} shadow="sm" p="md" mb="sm">
          <b>{r.user}</b> ({r.email})
          <br />
          {r.date} — {r.start_time} a {r.end_time}
        </Card>
      ))}
    </div>
  );
}
