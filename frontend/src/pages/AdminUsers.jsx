import { useEffect, useState } from "react";
import { adminAPI } from "../api/adminApi.js";
import { Table, Button, Title, Text } from "@mantine/core";

export default function AdminUsers() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await adminAPI.listUsers();
        if (!cancelled) setRows(data);
      } catch (e) {
        console.error("Error cargando usuarios", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function makeAdmin(id) {
    await adminAPI.makeAdmin(id);
    const data = await adminAPI.listUsers();
    setRows(data);
  }

  async function removeAdmin(id) {
    await adminAPI.removeAdmin(id);
    const data = await adminAPI.listUsers();
    setRows(data);
  }

  if (rows.length === 0) {
    return <Text>No hay usuarios.</Text>;
  }

  return (
    <>
      <Title order={3} mb="md">
        Usuarios
      </Title>

      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Nombre</Table.Th>
            <Table.Th>Email</Table.Th>
            <Table.Th>Rol</Table.Th>
            <Table.Th>Acciones</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((u) => (
            <Table.Tr key={u.id}>
              <Table.Td>{u.id}</Table.Td>
              <Table.Td>{u.full_name}</Table.Td>
              <Table.Td>{u.email}</Table.Td>
              <Table.Td>{u.role}</Table.Td>
              <Table.Td>
                {u.role === "admin" ? (
                  <Button
                    size="xs"
                    color="red"
                    onClick={() => removeAdmin(u.id)}
                  >
                    Quitar admin
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    onClick={() => makeAdmin(u.id)}
                  >
                    Hacer admin
                  </Button>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}
