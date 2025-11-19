import { useEffect, useState } from "react";
import { Card, Title } from "@mantine/core";
import { adminAPI } from "../api/adminApi";

export default function AdminAvailabilities() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await adminAPI.listAvailability();
        if (!cancelled) {
          setRows(data);
        }
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

      {rows.map((r) => (
        <Card key={r.id} shadow="sm" p="md" mb="sm">
          <b>{r.user}</b>
          <br />
          {r.date} — {r.start_time} a {r.end_time}
        </Card>
      ))}
    </div>
  );
}
