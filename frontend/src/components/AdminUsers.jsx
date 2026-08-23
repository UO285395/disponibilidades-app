import { useEffect, useMemo, useState } from "react";
import { adminAPI } from "../api/adminApi.js";
import OrgUnitSelect from "./OrgUnitSelect.jsx";
import {
  Table,
  Button,
  Title,
  Text,
  Card,
  TextInput,
  Notification,
  Group,
  Modal,
  Badge,
  Select,
  Center,
  Stack,
  Loader,
  Divider,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";

export default function AdminUsers({ currentUser }) {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [groupTag, setGroupTag] = useState("");
  const [newUserUnitId, setNewUserUnitId] = useState(null);
  const [filterUnitId, setFilterUnitId] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tagDrafts, setTagDrafts] = useState({});
  const [modalUserId, setModalUserId] = useState(null);
  const [moveUser, setMoveUser] = useState(null);
  const [membershipUserId, setMembershipUserId] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [membershipUnitId, setMembershipUnitId] = useState(null);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [membershipError, setMembershipError] = useState("");

  function getGroupTags(user) {
    if (Array.isArray(user?.group_tags)) return user.group_tags;
    if (!user?.group_tag) return [];
    return String(user.group_tag)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  async function reload() {
    // El filtro por estructura se resuelve en servidor e incluye las inferiores.
    const users = await adminAPI.listUsers(filterUnitId ? Number(filterUnitId) : null);
    setRows(users);
    setTagDrafts((prev) => {
      const next = { ...prev };
      for (const user of users) {
        if (!(user.id in next)) {
          next[user.id] = "";
        }
      }
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const users = await adminAPI.listUsers(filterUnitId ? Number(filterUnitId) : null);
        if (!cancelled) {
          setRows(users);
          setTagDrafts((prev) => {
            const next = { ...prev };
            for (const user of users) {
              if (!(user.id in next)) {
                next[user.id] = "";
              }
            }
            return next;
          });
        }
      } catch (e) {
        console.error("Error cargando usuarios", e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filterUnitId]);

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
    if (!newUserUnitId) {
      setError("Selecciona la estructura a la que pertenece el usuario");
      return;
    }

    try {
      // La estructura ya no se deduce del email: se indica explícitamente.
      await adminAPI.createUser({
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        password: password,
        group_tags: groupTag.trim() ? [groupTag.trim()] : null,
        org_unit_id: Number(newUserUnitId),
      });
      setEmail("");
      setFullName("");
      setPassword("");
      setGroupTag("");
      setSuccess("Usuario creado");
      await reload();
    } catch (e) {
      setError(e?.message || "Error creando usuario");
    }
  }

  async function openMemberships(userId) {
    setMembershipUserId(userId);
    setMembershipError("");
    setMembershipUnitId(null);
    setMembershipLoading(true);
    try {
      const data = await adminAPI.listUserMemberships(userId);
      setMemberships(data);
    } catch (e) {
      setMembershipError(e?.message || "Error cargando membresías");
    } finally {
      setMembershipLoading(false);
    }
  }

  async function addMembership() {
    if (!membershipUnitId) return;
    setMembershipError("");
    try {
      const m = await adminAPI.addUserMembership(membershipUserId, Number(membershipUnitId));
      setMemberships((prev) => [...prev, m]);
      setMembershipUnitId(null);
    } catch (e) {
      setMembershipError(e?.message || "No se pudo añadir la membresía");
    }
  }

  async function removeMembership(membershipId) {
    setMembershipError("");
    try {
      await adminAPI.removeUserMembership(membershipUserId, membershipId);
      setMemberships((prev) => prev.filter((m) => m.id !== membershipId));
    } catch (e) {
      setMembershipError(e?.message || "No se pudo eliminar la membresía");
    }
  }

  async function changeUserUnit(userId, unitId) {
    setError("");
    setSuccess("");
    try {
      await adminAPI.updateUserOrgUnit(userId, Number(unitId));
      setMoveUser(null);
      setSuccess("Usuario movido de estructura");
      await reload();
    } catch (e) {
      setError(e?.message || "No se pudo mover el usuario");
    }
  }

  async function addGroupTag(userId) {
    setError("");
    setSuccess("");

    const nextTag = (tagDrafts[userId] || "").trim();
    if (!nextTag) {
      setError("Indica una etiqueta para añadir");
      return;
    }

    try {
      await adminAPI.addUserGroupTag(userId, nextTag);
      setTagDrafts((prev) => ({ ...prev, [userId]: "" }));
      setSuccess("Etiqueta añadida");
      await reload();
    } catch (e) {
      setError(e?.message || "Error añadiendo etiqueta");
    }
  }

  async function removeGroupTag(userId, tag) {
    setError("");
    setSuccess("");

    try {
      await adminAPI.removeUserGroupTag(userId, tag);
      setSuccess("Etiqueta eliminada");
      await reload();
    } catch (e) {
      setError(e?.message || "Error eliminando etiqueta");
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
    const q = search.trim().toLowerCase();
    return [...rows]
      .filter((u) => {
        if (roleFilter !== "all" && u.role !== roleFilter) return false;
        if (!q) return true;
        return (
          String(u.full_name || "").toLowerCase().includes(q) ||
          String(u.email || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const byEmail = a.email.localeCompare(b.email, "es", { sensitivity: "base" });
        if (byEmail !== 0) return byEmail;
        return a.full_name.localeCompare(b.full_name, "es", { sensitivity: "base" });
      });
  }, [rows, search, roleFilter]);

  const modalUser = useMemo(
    () => sortedRows.find((user) => user.id === modalUserId) || null,
    [sortedRows, modalUserId]
  );

  if (!loaded) {
    return <Text>Cargando usuarios…</Text>;
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

        <OrgUnitSelect
          label="Estructura"
          description="Estructura a la que pertenece el usuario. Puedes elegir la tuya o cualquiera que dependa de ella."
          placeholder="Selecciona una estructura"
          clearable={false}
          value={newUserUnitId}
          onChange={setNewUserUnitId}
          mb="sm"
        />

        <TextInput
          label="Primera etiqueta (opcional)"
          placeholder="Ej: organizador"
          value={groupTag}
          onChange={(e) => setGroupTag(e.target.value)}
          mb="sm"
        />

        <Button onClick={createUser}>Crear usuario</Button>
      </Card>

      <Group align="flex-end" mb="md" wrap="wrap">
        <OrgUnitSelect
          label="Filtrar por estructura"
          description="Incluye las estructuras que dependen de la elegida"
          placeholder="Todo mi ámbito"
          value={filterUnitId}
          onChange={setFilterUnitId}
          maw={360}
          style={{ flex: 1, minWidth: 220 }}
        />
        <TextInput
          label="Buscar"
          placeholder="Nombre o email"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <Select
          label="Rol"
          value={roleFilter}
          onChange={(v) => setRoleFilter(v || "all")}
          data={[
            { value: "all", label: "Todos" },
            { value: "user", label: "Militantes" },
            { value: "admin", label: "Administradores" },
            { value: "superadmin", label: "Superadmin" },
          ]}
          maw={200}
        />
      </Group>

      <Text size="sm" c="dimmed" mb="xs">{sortedRows.length} usuario(s)</Text>

      {sortedRows.length === 0 ? (
        <Center py="lg">
          <Text c="dimmed">Ningún usuario coincide con los filtros.</Text>
        </Center>
      ) : (
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Nombre</Table.Th>
            <Table.Th>Email</Table.Th>
            <Table.Th>Estructura</Table.Th>
            <Table.Th>Rol</Table.Th>
            <Table.Th>Etiquetas</Table.Th>
            <Table.Th>Acciones</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sortedRows.map((u) => (
            <Table.Tr key={u.id}>
              <Table.Td>{u.id}</Table.Td>
              <Table.Td>{u.full_name}</Table.Td>
              <Table.Td>{u.email}</Table.Td>
              <Table.Td>
                <Group gap={4} wrap="nowrap">
                  <Text size="sm">{u.org_unit_name || "—"}</Text>
                  <Button size="compact-xs" variant="subtle" onClick={() => setMoveUser(u)}>
                    Mover
                  </Button>
                </Group>
              </Table.Td>
              <Table.Td>{u.role}</Table.Td>
              <Table.Td>
                <Group gap="xs">
                  <TextInput
                    placeholder="Añadir etiqueta"
                    value={tagDrafts[u.id] ?? ""}
                    onChange={(e) =>
                      setTagDrafts((prev) => ({
                        ...prev,
                        [u.id]: e.target.value,
                      }))
                    }
                  />
                  <Button size="xs" variant="light" onClick={() => addGroupTag(u.id)}>
                    Añadir
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => setModalUserId(u.id)}>
                    Ver etiquetas ({getGroupTags(u).length})
                  </Button>
                </Group>
              </Table.Td>
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

                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => openMemberships(u.id)}
                  >
                    Comités
                  </Button>

                  {currentUser.role === "superadmin" && currentUser.id !== u.id && (
                    <Button
                      size="xs"
                      color="red"
                      onClick={() => deleteUser(u.id)}
                    >
                      Eliminar
                    </Button>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      )}

      <Modal
        centered
        size="sm"
        opened={Boolean(modalUser)}
        onClose={() => setModalUserId(null)}
        title={modalUser ? `Etiquetas de ${modalUser.full_name}` : "Etiquetas"}
      >
        {!modalUser || getGroupTags(modalUser).length === 0 ? (
          <Text size="sm" c="dimmed">Este usuario no tiene etiquetas.</Text>
        ) : (
          <Group gap="xs">
            {getGroupTags(modalUser).map((tag) => (
              <Badge key={tag} size="lg" rightSection={
                <Button
                  variant="subtle"
                  size="compact-xs"
                  color="red"
                  onClick={() => removeGroupTag(modalUser.id, tag)}
                >
                  x
                </Button>
              }>
                {tag}
              </Badge>
            ))}
          </Group>
        )}
      </Modal>

      {/* Modal de membresías adicionales (comités superiores) */}
      {membershipUserId !== null && (
        <MembershipsModal
          user={sortedRows.find((u) => u.id === membershipUserId) || null}
          memberships={memberships}
          loading={membershipLoading}
          error={membershipError}
          unitId={membershipUnitId}
          onUnitChange={setMembershipUnitId}
          onAdd={addMembership}
          onRemove={removeMembership}
          onClose={() => { setMembershipUserId(null); setMemberships([]); }}
        />
      )}

      {moveUser && (
        <MoveUserModal
          user={moveUser}
          onClose={() => setMoveUser(null)}
          onConfirm={(unitId) => changeUserUnit(moveUser.id, unitId)}
        />
      )}
    </>
  );
}

function MoveUserModal({ user, onClose, onConfirm }) {
  const [unitId, setUnitId] = useState(user.org_unit_id ? String(user.org_unit_id) : null);

  return (
    <Modal centered size="sm" opened onClose={onClose} title={`Mover a ${user.full_name}`}>
      <Text size="sm" c="dimmed" mb="sm">
        Estructura actual: <b>{user.org_unit_name || "—"}</b>. Solo puedes moverlo
        a tu estructura o a una que dependa de ella.
      </Text>
      <OrgUnitSelect
        label="Nueva estructura"
        placeholder="Selecciona una estructura"
        clearable={false}
        value={unitId}
        onChange={setUnitId}
        mb="md"
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>Cancelar</Button>
        <Button disabled={!unitId} onClick={() => onConfirm(unitId)}>Mover</Button>
      </Group>
    </Modal>
  );
}

function MembershipsModal({
  user, memberships, loading, error,
  unitId, onUnitChange, onAdd, onRemove, onClose,
}) {
  return (
    <Modal
      centered
      size="sm"
      opened
      onClose={onClose}
      title={user ? `Comités de ${user.full_name}` : "Comités adicionales"}
    >
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          Colectivo: <b>{user?.org_unit_name || "—"}</b>. Aquí puedes añadir
          membresías a comités superiores (máximo uno por nivel de jerarquía).
        </Text>

        <Divider />

        {loading ? (
          <Center py="md"><Loader size="sm" /></Center>
        ) : memberships.length === 0 ? (
          <Text size="sm" c="dimmed">Sin comités adicionales.</Text>
        ) : (
          <Stack gap="xs">
            {memberships.map((m) => (
              <Group key={m.id} justify="space-between" wrap="nowrap">
                <div>
                  <Text size="sm" fw={500}>{m.org_unit_name}</Text>
                  {m.level_label && (
                    <Text size="xs" c="dimmed">{m.level_label}</Text>
                  )}
                </div>
                <Button
                  size="compact-xs"
                  color="red"
                  variant="subtle"
                  onClick={() => onRemove(m.id)}
                >
                  Eliminar
                </Button>
              </Group>
            ))}
          </Stack>
        )}

        {error && <Text size="xs" c="red">{error}</Text>}

        <Divider />

        <OrgUnitSelect
          label="Añadir comité"
          placeholder="Selecciona una estructura"
          value={unitId}
          onChange={onUnitChange}
        />
        <Button disabled={!unitId} onClick={onAdd} fullWidth>
          Añadir
        </Button>
      </Stack>
    </Modal>
  );
}
