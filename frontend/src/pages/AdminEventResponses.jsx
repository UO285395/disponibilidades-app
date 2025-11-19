import { useEffect, useRef, useState } from "react";
import { adminAPI } from "../api/adminApi";
import { Card, Title } from "@mantine/core";
import { useParams } from "react-router-dom";

export default function AdminEventResponses() {
  const { id } = useParams();
  const [responses, setResponses] = useState([]);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      try {
        const data = await adminAPI.getEventResponses(id);
        setResponses(data);
      } catch (err) {
        console.error("Error cargando respuestas:", err);
      }
    })();
  }, [id]);

  return (
    <div>
      <Title order={2}>Respuestas del evento {id}</Title>

      {responses.length === 0 && (
        <p style={{ marginTop: "20px" }}>Nadie ha respondido todavía.</p>
      )}

      {responses.map((r) => (
        <Card key={r.id} mt="md" shadow="sm" p="lg">
          <b>Usuario:</b> {r.user_full_name} ({r.user_email})
          <br />
          <b>Respuesta:</b> {r.answer}
          <br />
          {r.justification && r.justification.trim() !== "" && (
            <p>
              <b>Justificación:</b> {r.justification}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
