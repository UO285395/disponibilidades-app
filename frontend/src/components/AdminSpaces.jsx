import { useEffect, useState } from "react";
import {
  Card,
  Title,
  TextInput,
  Text,
  Button,
  Table,
  Notification,
  Group,
} from "@mantine/core";
import { adminAPI } from "../api/adminApi.js";

export default function AdminSpaces() {
  const [spaces, setSpaces] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    reload();
  }, []);

  async function reload() {
    try {
      const list = await adminAPI.listSpaces();
      setSpaces(list);
    } catch (e) {
      console.error(e);
    }
  }

  async function create() {
    setError("");
    setSuccess("");
    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }

    try {
      await adminAPI.createSpace(name.trim(), description.trim() || null);
      setSuccess("Espacio creado");
      setName("");
      setDescription("");
      reload();
    } catch (e) {
      setError(e.message || "Error creando espacio");
    }
  }

  async function remove(id) {
    try {
      await adminAPI.deleteSpace(id);
      setSuccess("Espacio eliminado");
      reload();
    } catch (e) {
      setError(e.message || "Error eliminando espacio");
    }
  }

  return (
    <div>
      <Title order={3} mb="md">
        Gestión de espacios
      </Title>

      <Card shadow="sm" p="md" mb="md">
        {error && <Notification color="red" mb="sm">{error}</Notification>}
        {success && <Notification color="green" mb="sm">{success}</Notification>}

        <TextInput
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          mb="sm"
        />
        <TextInput
          label="Descripción"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          mb="sm"
        />
        <Button onClick={create}>Crear espacio</Button>
      </Card>

      <Card shadow="sm" p="md">
        <Text mb="sm">Espacios existentes</Text>
        <Table striped highlightOnHover>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Descripción</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {spaces.map((space) => (
              <tr key={space.id}>
                <td>{space.name}</td>
                <td
                  style={{
                    whiteSpace: "normal",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    maxWidth: "520px",
                  }}
                >
                  {space.description || "--"}
                </td>
                <td>
                  <Button compact color="red" onClick={() => remove(space.id)}>
                    Borrar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
