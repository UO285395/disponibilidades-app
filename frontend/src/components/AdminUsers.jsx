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
      )}

      <Modal
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
    <Modal opened onClose={onClose} title={`Mover a ${user.full_name}`}>
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
