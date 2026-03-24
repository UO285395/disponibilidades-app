import { useEffect, useMemo, useState } from "react";
import { adminAPI } from "../api/adminApi.js";
import { userAPI } from "../api/api.js";
import { Table, Button, Title, Text, Card, TextInput, Notification, Group } from "@mantine/core";

export default function AdminUsers() {
  const [rows, setRows] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function reload() {
    const [users, me] = await Promise.all([adminAPI.listUsers(), userAPI.me()]);
    setRows(users);
    setCurrentUser(me);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [users, me] = await Promise.all([adminAPI.listUsers(), userAPI.me()]);
        if (!cancelled) {
          setRows(users);
          setCurrentUser(me);
        }
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
    await reload();
  }

  async function removeAdmin(id) {
    await adminAPI.removeAdmin(id);
    await reload();
  }

  async function createUser() {
    setError("");
    setSuccess("");

    if (!email.trim() || !fullName.trim() || !password.trim()) {
      setError("Email, nombre y contraseña son obligatorios");
      return;
    }

    try {
      await adminAPI.createUser({
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        password: password,
      });
      setEmail("");
      setFullName("");
      setPassword("");
      setSuccess("Usuario creado");
      await reload();
    } catch (e) {
      setError(e?.message || "Error creando usuario");
    }
  }

  async function deleteUser(id) {
    setError("");
    setSuccess("");

    try {
      await adminAPI.deleteUser(id);
      setSuccess("Usuario eliminado");
      await reload();
    } catch (e) {
      setError(e?.message || "Error eliminando usuario");
    }
  }

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const byEmail = a.email.localeCompare(b.email, "es", { sensitivity: "base" });
      if (byEmail !== 0) return byEmail;
      return a.full_name.localeCompare(b.full_name, "es", { sensitivity: "base" });
    });
  }, [rows]);

  if (!currentUser) {
    return <Text>Cargando usuarios…</Text>;
  }

  if (sortedRows.length === 0) {
    return <Text>No hay usuarios.</Text>;
  }

  return (
    <>
      <Title order={3} mb="md">
        Usuarios
      </Title>

      <Card shadow="sm" p="md" mb="md">
        {error && <Notification color="red" mb="sm">{error}</Notification>}
        {success && <Notification color="green" mb="sm">{success}</Notification>}

        <TextInput
          label="Nombre"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          mb="sm"
        />
        <TextInput
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          mb="sm"
        />
        <TextInput
          type="password"
          label="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          mb="sm"
        />

        <Button onClick={createUser}>Crear usuario</Button>
      </Card>

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
          {sortedRows.map((u) => (
            <Table.Tr key={u.id}>
              <Table.Td>{u.id}</Table.Td>
              <Table.Td>{u.full_name}</Table.Td>
              <Table.Td>{u.email}</Table.Td>
              <Table.Td>{u.role}</Table.Td>
              <Table.Td>
                <Group gap="xs">
                  {u.role === "admin" ? (
                    <Button
                      size="xs"
                      color="orange"
                      onClick={() => removeAdmin(u.id)}
                    >
                      Quitar admin
                    </Button>
                  ) : u.role === "user" ? (
                    <Button
                      size="xs"
                      onClick={() => makeAdmin(u.id)}
                    >
                      Hacer admin
                    </Button>
                  ) : null}

                  {currentUser.role === "superadmin" && currentUser.id !== u.id && (
                    <Button
                      size="xs"
                      color="red"
                      onClick={() => deleteUser(u.id)}
                    >
                      Eliminar usuario
                    </Button>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}
