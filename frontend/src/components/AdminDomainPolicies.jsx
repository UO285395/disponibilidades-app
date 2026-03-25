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
  Stack,
} from "@mantine/core";
import { adminAPI } from "../api/adminApi.js";

export default function AdminDomainPolicies() {
  const [policies, setPolicies] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [domain, setDomain] = useState("");
  const [eventsEnabled, setEventsEnabled] = useState(true);
  const [availabilitiesEnabled, setAvailabilitiesEnabled] = useState(true);
  const [spacesEnabled, setSpacesEnabled] = useState(true);
  const [usersEnabled, setUsersEnabled] = useState(true);
  const [domainPoliciesEnabled, setDomainPoliciesEnabled] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadPolicies();
  }, []);

  async function loadPolicies() {
    try {
      const data = await adminAPI.listDomainPolicies();
      setPolicies(data.sort((left, right) => left.domain.localeCompare(right.domain)));
    } catch (e) {
      console.error(e);
    }
  }

  function resetForm() {
    setEditingId(null);
    setDomain("");
    setEventsEnabled(true);
    setAvailabilitiesEnabled(true);
    setSpacesEnabled(true);
    setUsersEnabled(true);
    setDomainPoliciesEnabled(false);
  }

  function fillForm(policy) {
    setEditingId(policy.id);
    setDomain(policy.domain);
    setEventsEnabled(Boolean(policy.events_enabled));
    setAvailabilitiesEnabled(Boolean(policy.availabilities_enabled));
    setSpacesEnabled(Boolean(policy.spaces_enabled));
    setUsersEnabled(Boolean(policy.users_enabled));
    setDomainPoliciesEnabled(Boolean(policy.domain_policies_enabled));
  }

  async function submitPolicy() {
    try {
      setError("");
      setSuccess("");
      const normalizedDomain = domain.trim().toLowerCase();

      if (!normalizedDomain) {
        setError("Colectivo requerido");
        return;
      }

      const payload = {
        domain: normalizedDomain,
        events_enabled: eventsEnabled,
        availabilities_enabled: availabilitiesEnabled,
        spaces_enabled: spacesEnabled,
        users_enabled: usersEnabled,
        domain_policies_enabled: domainPoliciesEnabled,
      };

      if (editingId) {
        await adminAPI.updateDomainPolicy(editingId, payload);
        setSuccess("Política actualizada");
      } else {
        await adminAPI.createDomainPolicy(payload);
        setSuccess("Política creada");
      }

      resetForm();
      await loadPolicies();
    } catch (e) {
      setError(e.message || "Error al crear política");
    }
  }

  async function deletePolicy(id) {
    try {
      await adminAPI.deleteDomainPolicy(id);
      if (editingId === id) {
        resetForm();
      }
      await loadPolicies();
    } catch (e) {
      console.error(e);
    }
  }

  const totalPolicies = policies.length;
  const summary = {
    events: policies.filter((policy) => policy.events_enabled).length,
    availabilities: policies.filter((policy) => policy.availabilities_enabled).length,
    spaces: policies.filter((policy) => policy.spaces_enabled).length,
    users: policies.filter((policy) => policy.users_enabled).length,
  };

  return (
    <div>
      <Title order={3} mb="md">
        Políticas de colectivo
      </Title>

      <Card shadow="sm" p="md" mb="md">
        {error && <Notification color="red">{error}</Notification>}
        {success && <Notification color="green">{success}</Notification>}

        <Text size="sm" c="dimmed" mb="sm">
          Define qué módulos puede usar cada colectivo. Ejemplo: un colectivo invitado puede tener solo eventos habilitados.
        </Text>

        <TextInput
          label="Colectivo"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          mb="sm"
          placeholder="example.com"
        />

        <Stack gap="xs">
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
          <Checkbox
            label="Usuarios"
            checked={usersEnabled}
            onChange={(event) => setUsersEnabled(event.currentTarget.checked)}
          />
          <Checkbox
            label="Políticas de colectivo"
            checked={domainPoliciesEnabled}
            onChange={(event) => setDomainPoliciesEnabled(event.currentTarget.checked)}
          />
        </Stack>

        <Group mt="sm">
          <Button onClick={submitPolicy}>
            {editingId ? "Guardar cambios" : "Agregar política"}
          </Button>
          {editingId && (
            <Button variant="outline" onClick={resetForm}>
              Cancelar edición
            </Button>
          )}
        </Group>
      </Card>

      <Card shadow="sm" p="md" mb="md">
        <Text fw={600} mb="xs">Resumen</Text>
        <Group gap="lg">
          <Text size="sm">Eventos: {summary.events}/{totalPolicies}</Text>
          <Text size="sm">Disponibilidades: {summary.availabilities}/{totalPolicies}</Text>
          <Text size="sm">Espacios: {summary.spaces}/{totalPolicies}</Text>
          <Text size="sm">Usuarios: {summary.users}/{totalPolicies}</Text>
        </Group>
      </Card>

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Colectivo</Table.Th>
            <Table.Th>Eventos</Table.Th>
            <Table.Th>Disponibilidades</Table.Th>
            <Table.Th>Espacios</Table.Th>
            <Table.Th>Usuarios</Table.Th>
            <Table.Th>Acciones</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {policies.map((p) => (
            <Table.Tr key={p.id}>
              <Table.Td>{p.domain}</Table.Td>
              <Table.Td>{p.events_enabled ? "Sí" : "No"}</Table.Td>
              <Table.Td>{p.availabilities_enabled ? "Sí" : "No"}</Table.Td>
              <Table.Td>{p.spaces_enabled ? "Sí" : "No"}</Table.Td>
              <Table.Td>{p.users_enabled ? "Sí" : "No"}</Table.Td>
              <Table.Td>
                <Group gap="xs">
                  <Button compact variant="outline" size="xs" onClick={() => fillForm(p)}>
                    Editar
                  </Button>
                  <Button compact color="red" size="xs" onClick={() => deletePolicy(p.id)}>
                  Eliminar
                  </Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
}
