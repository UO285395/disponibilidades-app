import { useEffect, useState } from "react";
import { adminAPI } from "../api/adminApi.js";
import { Card, Title, Text } from "@mantine/core";

export default function AdminAvailabilities() {
  const [rows, setRows] = useState([]);

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

  return (
    <div>
      <Title order={3} mb="md">
        Disponibilidades semanales
      </Title>

      {rows.length === 0 && (
        <Text size="sm" c="dimmed">
          No hay disponibilidades registradas.
        </Text>
      )}

      {rows.map((r) => (
        <Card key={r.id} shadow="sm" p="md" mb="sm">
          <b>{r.user}</b> ({r.email})
          <br />
          {r.date} — {r.start_time} a {r.end_time}
        </Card>
      ))}
    </div>
  );
}
