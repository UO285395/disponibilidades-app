import { Card, Button } from "@mantine/core";
import { useNavigate } from "react-router-dom";

export default function EventsListAdmin({ events }) {
  const navigate = useNavigate();

  return (
    <div>
      {events.map(ev => (
        <Card key={ev.id} shadow="sm" mt="md" p="lg">
          <b>{ev.title}</b> — {ev.date}
          <br />

          <Button mt="sm" onClick={() => navigate(`/admin/event/${ev.id}`)}>
            Ver respuestas
          </Button>
        </Card>
      ))}
    </div>
  );
}
