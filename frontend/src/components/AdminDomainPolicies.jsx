import { useEffect, useState } from "react";
import {
  Card,
  Title,
  Table,
  TextInput,
  Button,
  Checkbox,
  Notification,
  Group,
  Text,
} from "@mantine/core";
import { adminAPI } from "../api/adminApi.js";

export default function AdminDomainPolicies() {
  const [policies, setPolicies] = useState([]);
  const [domain, setDomain] = useState("");
  const [eventsEnabled, setEventsEnabled] = useState(true);
  const [availabilitiesEnabled, setAvailabilitiesEnabled] = useState(true);
  const [spacesEnabled, setSpacesEnabled] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadPolicies();
  }, []);

  async function loadPolicies() {
    try {
      const data = await adminAPI.listDomainPolicies();
      setPolicies(data);
    } catch (e) {
      console.error(e);
    }
  }

  async function createPolicy() {
    try {
      setError("");
      setSuccess("");
      if (!domain.trim()) {
        setError("Dominio requerido");
        return;
      }

      await adminAPI.createDomainPolicy(
        domain.trim().toLowerCase(),
        eventsEnabled,
        availabilitiesEnabled,
        spacesEnabled
      );

      setSuccess("Política creada");
      setDomain("");
      setEventsEnabled(true);
      setAvailabilitiesEnabled(true);
      setSpacesEnabled(true);
      loadPolicies();
    } catch (e) {
      setError(e.message || "Error al crear política");
    }
  }

  async function deletePolicy(id) {
    try {
      await adminAPI.deleteDomainPolicy(id);
      loadPolicies();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div>
      <Title order={3} mb="md">
        Políticas de dominio
      </Title>

      <Card shadow="sm" p="md" mb="md">
        {error && <Notification color="red">{error}</Notification>}
        {success && <Notification color="green">{success}</Notification>}

        <TextInput
          label="Dominio"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          mb="sm"
          placeholder="example.com"
        />
        <Group>
          <Checkbox
            label="Eventos"
            checked={eventsEnabled}
            onChange={(event) => setEventsEnabled(event.currentTarget.checked)}
          />
          <Checkbox
            label="Disponibilidades"
            checked={availabilitiesEnabled}
            onChange={(event) => setAvailabilitiesEnabled(event.currentTarget.checked)}
          />
          <Checkbox
            label="Espacios"
            checked={spacesEnabled}
            onChange={(event) => setSpacesEnabled(event.currentTarget.checked)}
          />
        </Group>
        <Button mt="sm" onClick={createPolicy}>
          Agregar política
        </Button>
      </Card>

      <Table striped highlightOnHover>
        <thead>
          <tr>
            <th>Dominio</th>
            <th>Eventos</th>
            <th>Disponibilidades</th>
            <th>Espacios</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr key={p.id}>
              <td>{p.domain}</td>
              <td>{p.events_enabled ? "Sí" : "No"}</td>
              <td>{p.availabilities_enabled ? "Sí" : "No"}</td>
              <td>{p.spaces_enabled ? "Sí" : "No"}</td>
              <td>
                <Button compact color="red" size="xs" onClick={() => deletePolicy(p.id)}>
                  Eliminar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
