import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminAPI } from "../api/adminApi.js";
import { Card, Title, Text, Button, Box } from "@mantine/core";

export default function AdminEventResponses() {
  const { id } = useParams();
  const [responses, setResponses] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await adminAPI.getEventResponses(id);
        if (!cancelled) setResponses(data);
      } catch (e) {
        console.error("Error cargando respuestas", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <Box p="lg">
      <Button mb="md" variant="outline" onClick={() => navigate("/admin")}>
        Volver
      </Button>

      <Title order={2} mb="lg">
        Respuestas del evento {id}
      </Title>

      {responses.length === 0 && <Text>No hay respuestas todavía.</Text>}

      {responses.map((r, idx) => (
        <Card key={idx} mt="md" shadow="sm" p="lg">
          <Text fw={600}>{r.user_full_name}</Text>
          <Text>
            <b>Respuesta:</b> {r.answer}
          </Text>
          {r.justification && (
            <Text>
              <b>Justificación:</b> {r.justification}
            </Text>
          )}
        </Card>
      ))}
    </Box>
  );
}
