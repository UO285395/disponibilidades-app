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
  // FILTRAR POR CÓDIGO (email → nombre@CÓDIGO)
  // -------------------------------
  const filtered = useMemo(() => {
    if (!filterCode.trim()) return rows;

    return rows.filter((r) => {
      const code = r.email.split("@")[1]?.toLowerCase();
      return code && code.includes(filterCode.toLowerCase());
    });
  }, [rows, filterCode]);

  // -------------------------------
  // BEST MATCH (usando FILTRADOS)
  // y devolviendo TODOS los empates
  // -------------------------------
  const bestMatches = useMemo(() => {
    if (filtered.length === 0) return [];

    const counter = {};

    for (const r of filtered) {
      const startHour = Number(r.start_time.slice(0, 2));
      const endHour = Number(r.end_time.slice(0, 2));

      for (let h = startHour; h < endHour; h++) {
        const key = `${r.date} ${h}:00-${h + 1}:00`;
        counter[key] = (counter[key] || 0) + 1;
      }
    }

    // hallar valor máximo
    const maxVal = Math.max(...Object.values(counter));

    // devolver TODAS las claves que tengan ese valor
    return Object.entries(counter)
      .filter(([_, v]) => v === maxVal)
      .map(([slot, count]) => ({ slot, count }));
  }, [filtered]);

  return (
    <div>
      <Title order={3} mb="md">
        Disponibilidades semanales
      </Title>

      {/* ---------------------------
            FILTRO POR CÓDIGO
       ---------------------------- */}
      <TextInput
        placeholder="Filtrar por colectivo (código del email)"
        value={filterCode}
        onChange={(e) => setFilterCode(e.target.value)}
        mb="lg"
      />

      {/* ---------------------------
            BEST MATCH (con empates)
       ---------------------------- */}
      {bestMatches.length > 0 && (
        <Card shadow="md" p="md" mb="lg" style={{ background: "#e8f7e4" }}>
          <Text fw={700} mb="sm">
            Mejores coincidencias (máximo {bestMatches[0].count} personas):
          </Text>

          <Group gap="xs">
            {bestMatches.map((b, i) => (
              <Badge key={i} color="green" size="lg">
                {b.slot}
              </Badge>
            ))}
          </Group>
        </Card>
      )}

      {/* ---------------------------
            LISTADO DE DISPONIBILIDADES
       ---------------------------- */}
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
