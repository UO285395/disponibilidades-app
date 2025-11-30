import { useEffect, useState, useMemo } from "react";
import { adminAPI } from "../api/adminApi.js";
import { Card, Title, Text, TextInput, Badge } from "@mantine/core";

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
  // HALLAR LA FRANJA CON MÁS COINCIDENCIAS
  // -------------------------------
  const bestMatch = useMemo(() => {
    if (rows.length === 0) return null;

    const counter = {};

    for (const r of rows) {
      const startHour = Number(r.start_time.slice(0, 2));
      const endHour = Number(r.end_time.slice(0, 2));

      for (let h = startHour; h < endHour; h++) {
        const key = `${r.date} ${h}:00`;

        counter[key] = (counter[key] || 0) + 1;
      }
    }

    let maxKey = null;
    let maxVal = 0;

    for (const [key, value] of Object.entries(counter)) {
      if (value > maxVal) {
        maxVal = value;
        maxKey = key;
      }
    }

    if (!maxKey) return null;

    return {
      slot: maxKey,
      count: maxVal,
    };
  }, [rows]);

  return (
    <div>
      <Title order={3} mb="md">
        Disponibilidades semanales
      </Title>

      {/* ---------------------------
            FILTRO POR CÓDIGO
       ---------------------------- */}
      <TextInput
        placeholder="Filtrar por colectivo"
        value={filterCode}
        onChange={(e) => setFilterCode(e.target.value)}
        mb="lg"
      />

      {/* ---------------------------
            MEJOR FRANJA
       ---------------------------- */}
      {bestMatch && (
        <Card shadow="md" p="md" mb="lg" style={{ background: "#e8f7e4" }}>
          <Text fw={700}>
            Mejor coincidencia:{" "}
            <Badge color="green" size="lg">
              {bestMatch.slot.replace(" ", " — ")}
            </Badge>
          </Text>
          <Text size="sm" mt="xs">
            {bestMatch.count} personas disponibles simultáneamente
          </Text>
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
