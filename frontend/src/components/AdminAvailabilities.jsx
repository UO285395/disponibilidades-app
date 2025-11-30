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
  // BEST MATCH (robusto + sin falsos positivos)
  // -------------------------------
  const bestMatches = useMemo(() => {
    if (filtered.length === 0) return [];

    const counter = {};

    // SOLO contamos franjas de los usuarios filtrados
    for (const r of filtered) {
      const startHour = Number(r.start_time.slice(0, 2));
      const endHour = Number(r.end_time.slice(0, 2));
      const day = r.date;

      for (let h = startHour; h < endHour; h++) {
        const key = `${day} ${String(h).padStart(2, "0")}:00-${String(
          h + 1
        ).padStart(2, "0")}:00`;

        counter[key] = (counter[key] || 0) + 1;
      }
    }

    const maxVal = Math.max(...Object.values(counter));

    // No hay coincidencias → devolver vacío
    if (maxVal === 0) return [];

    // Devolver TODAS las coincidencias iguales al máximo
    return Object.entries(counter)
      .filter(([_, count]) => count === maxVal)
      .map(([slot, count]) => ({ slot, count }));
  }, [filtered]);

  return (
    <div>
      <Title order={3} mb="md">
        Disponibilidades semanales
      </Title>

      {/* Filtro */}
      <TextInput
        placeholder="Filtrar por colectivo (código del email)"
        value={filterCode}
        onChange={(e) => setFilterCode(e.target.value)}
        mb="lg"
      />

      {/* BEST MATCH */}
      {bestMatches.length > 0 && (
        <Card shadow="md" p="md" mb="lg" style={{ background: "#e8f7e4" }}>
          <Text fw={700} mb="xs">
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

      {/* LISTADO */}
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
