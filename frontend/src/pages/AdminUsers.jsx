import { useEffect, useState } from "react";
import { Card, Button, Title } from "@mantine/core";
import { userAPI } from "../api/api";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await userAPI.list();
        if (!cancelled) {
          setUsers(data);
        }
      } catch (e) {
        console.error("Error cargando usuarios", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  

  return (
    <>
      <Title order={3} mb="md">Usuarios registrados</Title>

      {users.map((u) => (
        <Card key={u.id} shadow="sm" p="md" mb="md">
          <b>{u.full_name}</b> — {u.email}
          <br />
          Rol: {u.role}
          <Button
            mt="sm"
            onClick={() => (window.location = `/admin/user/${u.id}`)}
          >
            Ver disponibilidad
          </Button>
        </Card>
      ))}
    </>
  );
}
