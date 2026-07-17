import { useCallback, useEffect, useState } from "react";
import {
  Card, Title, Text, Group, Button, Badge, Stack, Modal, TextInput,
  Select, ActionIcon, Divider, Box, Loader,
} from "@mantine/core";
import { adminAPI } from "../api/adminApi.js";
import { invalidateOrgTree } from "../api/orgTreeCache.js";

// Pantalla de gestión del organigrama (estructura organizativa). Permite ver
// el árbol, crear/renombrar/mover/desactivar unidades, asignar administradores
// y etiquetar territorios. No expone terminología interna de diseño.

export default function AdminOrgStructure() {
  const [tree, setTree] = useState([]);
  const [levelTypes, setLevelTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [createParent, setCreateParent] = useState(null); // unit or "ROOT" or null
  const [renameUnit, setRenameUnit] = useState(null);
  const [moveUnit, setMoveUnit] = useState(null);
  const [adminsUnit, setAdminsUnit] = useState(null);
  const [territoriesUnit, setTerritoriesUnit] = useState(null);
  const [membersUnit, setMembersUnit] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Esta pantalla se recarga tras cada cambio de la estructura, así que es
      // el punto natural para tirar la caché compartida y que los selectores de
      // ámbito de otras pantallas no muestren una estructura obsoleta.
      invalidateOrgTree();
      const [treeData, types] = await Promise.all([
        adminAPI.orgTree(),
        adminAPI.orgLevelTypes(),
      ]);
      setTree(treeData);
      setLevelTypes(types);
      setError(null);
    } catch (e) {
      setError(e?.message || "No se pudo cargar la estructura");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const levelTypeByCode = Object.fromEntries(levelTypes.map((t) => [t.code, t]));
  const rootType = levelTypes.find((t) => t.is_root_only);

  function allowedChildTypes(unit) {
    // tipos que la matriz permite bajo el tipo de esta unidad
    const parentType = unit ? levelTypeByCode[unit.level_type] : rootType;
    if (!parentType) return [];
    return levelTypes.filter((t) => parentType.allowed_child_type_ids.includes(t.id));
  }

  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader />
      </Group>
    );
  }

  if (error) {
    return <Text c="red">{error}</Text>;
  }

  const hasRoot = tree.some((u) => u.parent_id === null);

  return (
    <Box>
      <Group justify="space-between" mb="md">
        <Title order={3}>Organigrama</Title>
        {!hasRoot && (
          <Button onClick={() => setCreateParent("ROOT")}>Crear estructura raíz</Button>
        )}
      </Group>

      <Text size="sm" c="dimmed" mb="md">
        Estructura de la organización. Cada administrador gestiona su unidad y
        todas las que dependen de ella.
      </Text>

      <Stack gap="xs">
        {tree.map((unit) => {
          const canAddChild = allowedChildTypes(unit).length > 0;
          return (
            <Card key={unit.id} shadow="xs" p="sm" radius="md" withBorder
              style={{ marginLeft: unit.depth * 24, opacity: unit.is_active ? 1 : 0.55 }}>
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="wrap">
                  <Text fw={600}>{unit.name}</Text>
                  <Badge size="sm" variant="light">{unit.level_label}</Badge>
                  <Badge size="sm" color="gray" variant="outline">
                    {unit.member_count ?? 0} pers.
                  </Badge>
                  {!unit.is_active && <Badge size="sm" color="red">Inactiva</Badge>}
                </Group>
                <Group gap={4} wrap="nowrap">
                  {canAddChild && (
                    <Button size="compact-xs" variant="light" onClick={() => setCreateParent(unit)}>
                      + Añadir
                    </Button>
                  )}
                  <Button size="compact-xs" variant="subtle" onClick={() => setMembersUnit(unit)}>
                    Ver personas
                  </Button>
                  <Button size="compact-xs" variant="subtle" onClick={() => setAdminsUnit(unit)}>
                    Admins
                  </Button>
                  <Button size="compact-xs" variant="subtle" onClick={() => setTerritoriesUnit(unit)}>
                    Territorio
                  </Button>
                  <Button size="compact-xs" variant="subtle" onClick={() => setRenameUnit(unit)}>
                    Renombrar
                  </Button>
                  {unit.parent_id !== null && (
                    <Button size="compact-xs" variant="subtle" onClick={() => setMoveUnit(unit)}>
                      Mover
                    </Button>
                  )}
                  {unit.parent_id !== null && (
                    unit.is_active ? (
                      <Button size="compact-xs" variant="subtle" color="orange"
                        onClick={async () => {
                          if (!window.confirm(`¿Desactivar "${unit.name}"? Se ocultará al crear cosas nuevas, pero no se pierde nada.`)) return;
                          await adminAPI.orgDeactivateUnit(unit.id);
                          load();
                        }}>
                        Desactivar
                      </Button>
                    ) : (
                      <Button size="compact-xs" variant="subtle" color="green"
                        onClick={async () => { await adminAPI.orgReactivateUnit(unit.id); load(); }}>
                        Reactivar
                      </Button>
                    )
                  )}
                  {unit.parent_id !== null && (
                    <Button size="compact-xs" variant="subtle" color="red"
                      onClick={async () => {
                        const people = unit.member_count ?? 0;
                        const aviso = people > 0
                          ? `\n\nLas ${people} persona(s) de esta unidad pasarán a la unidad superior.`
                          : "";
                        if (!window.confirm(`¿Eliminar "${unit.name}" definitivamente?${aviso}`)) return;
                        try {
                          await adminAPI.orgDeleteUnit(unit.id);
                          load();
                        } catch (e) {
                          alert(e?.message || "No se pudo eliminar la unidad");
                        }
                      }}>
                      Eliminar
                    </Button>
                  )}
                </Group>
              </Group>
            </Card>
          );
        })}
      </Stack>

      {createParent && (
        <CreateUnitModal
          parent={createParent === "ROOT" ? null : createParent}
          allowedTypes={createParent === "ROOT" ? levelTypes.filter((t) => t.is_root_only) : allowedChildTypes(createParent)}
          onClose={() => setCreateParent(null)}
          onDone={() => { setCreateParent(null); load(); }}
        />
      )}

      {renameUnit && (
        <RenameUnitModal unit={renameUnit} onClose={() => setRenameUnit(null)}
          onDone={() => { setRenameUnit(null); load(); }} />
      )}

      {moveUnit && (
        <MoveUnitModal unit={moveUnit} tree={tree} onClose={() => setMoveUnit(null)}
          onDone={() => { setMoveUnit(null); load(); }} />
      )}

      {adminsUnit && (
        <UnitAdminsModal unit={adminsUnit} onClose={() => setAdminsUnit(null)} />
      )}

      {territoriesUnit && (
        <UnitTerritoriesModal unit={territoriesUnit} onClose={() => setTerritoriesUnit(null)} />
      )}

      {membersUnit && (
        <UnitMembersModal unit={membersUnit} onClose={() => setMembersUnit(null)} />
      )}
    </Box>
  );
}

function CreateUnitModal({ parent, allowedTypes, onClose, onDone }) {
  const [name, setName] = useState("");
  const [levelTypeId, setLevelTypeId] = useState(allowedTypes[0]?.id ? String(allowedTypes[0].id) : null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim() || !levelTypeId) return;
    try {
      setSaving(true);
      await adminAPI.orgCreateUnit({
        name: name.trim(),
        level_type_id: Number(levelTypeId),
        parent_id: parent ? parent.id : null,
      });
      onDone();
    } catch (e) {
      alert(e?.message || "No se pudo crear");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={parent ? `Nueva unidad bajo "${parent.name}"` : "Nueva estructura raíz"}>
      <Select label="Tipo" data={allowedTypes.map((t) => ({ value: String(t.id), label: t.label }))}
        value={levelTypeId} onChange={setLevelTypeId} allowDeselect={false} mb="sm" />
      <TextInput label="Nombre" value={name} onChange={(e) => setName(e.target.value)} mb="md" />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} loading={saving}>Crear</Button>
      </Group>
    </Modal>
  );
}

function RenameUnitModal({ unit, onClose, onDone }) {
  const [name, setName] = useState(unit.name);
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!name.trim()) return;
    try {
      setSaving(true);
      await adminAPI.orgRenameUnit(unit.id, name.trim());
      onDone();
    } catch (e) {
      alert(e?.message || "No se pudo renombrar");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal opened onClose={onClose} title="Renombrar unidad">
      <TextInput label="Nombre" value={name} onChange={(e) => setName(e.target.value)} mb="md" />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} loading={saving}>Guardar</Button>
      </Group>
    </Modal>
  );
}

function MoveUnitModal({ unit, tree, onClose, onDone }) {
  // Posibles destinos: cualquier unidad que no sea la propia ni su subárbol.
  const candidates = tree.filter((u) => u.id !== unit.id && !u.path.startsWith(unit.path));
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!target) return;
    try {
      setSaving(true);
      await adminAPI.orgMoveUnit(unit.id, Number(target));
      onDone();
    } catch (e) {
      alert(e?.message || "No se pudo mover");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal opened onClose={onClose} title={`Mover "${unit.name}"`}>
      <Select label="Nueva unidad superior" searchable
        data={candidates.map((u) => ({ value: String(u.id), label: `${u.name} (${u.level_label})` }))}
        value={target} onChange={setTarget} mb="md" />
      <Text size="xs" c="dimmed" mb="md">
        Solo se permite mover a una unidad que admita este tipo por debajo.
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} loading={saving}>Mover</Button>
      </Group>
    </Modal>
  );
}

function UnitAdminsModal({ unit, onClose }) {
  const [admins, setAdmins] = useState([]);
  const [users, setUsers] = useState([]);
  const [picked, setPicked] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [a, u] = await Promise.all([adminAPI.orgUnitAdmins(unit.id), adminAPI.listUsers()]);
      setAdmins(a);
      setUsers(u);
    } finally {
      setLoading(false);
    }
  }, [unit.id]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <Modal opened onClose={onClose} title={`Administradores de "${unit.name}"`}>
      {loading ? <Loader /> : (
        <>
          <Stack gap="xs" mb="md">
            {admins.length === 0 && <Text size="sm" c="dimmed">Sin administradores asignados.</Text>}
            {admins.map((a) => (
              <Group key={a.assignment_id} justify="space-between">
                <Text size="sm">{a.full_name} · {a.email}</Text>
                <Button size="compact-xs" color="red" variant="subtle"
                  onClick={async () => { await adminAPI.orgRevokeAdmin(a.assignment_id); reload(); }}>
                  Quitar
                </Button>
              </Group>
            ))}
          </Stack>
          <Divider mb="md" />
          <Group align="flex-end">
            <Select label="Añadir administrador" searchable flex={1}
              data={users.map((u) => ({ value: String(u.id), label: `${u.full_name} · ${u.email}` }))}
              value={picked} onChange={setPicked} />
            <Button disabled={!picked}
              onClick={async () => { await adminAPI.orgGrantAdmin(unit.id, Number(picked)); setPicked(null); reload(); }}>
              Añadir
            </Button>
          </Group>
        </>
      )}
    </Modal>
  );
}

function UnitTerritoriesModal({ unit, onClose }) {
  const [rows, setRows] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [ttype, setTtype] = useState("provincia");
  const [tid, setTid] = useState(null);                 // comunidad / provincia
  const [cityProvinceId, setCityProvinceId] = useState(null);
  const [cityName, setCityName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [r, com, prov] = await Promise.all([
        adminAPI.orgUnitTerritories(unit.id),
        adminAPI.geoCommunities(),
        adminAPI.geoProvinces(),
      ]);
      setRows(r);
      setCommunities(com);
      setProvinces(prov);
    } finally {
      setLoading(false);
    }
  }, [unit.id]);

  useEffect(() => { reload(); }, [reload]);

  async function loadCitiesFor(provinceId) {
    setCityProvinceId(provinceId);
    setCities(await adminAPI.geoCities(Number(provinceId)));
  }

  function resetForm() {
    setTid(null);
    setCityName("");
    setCityProvinceId(null);
    setCities([]);
  }

  const canAdd = ttype === "ciudad" ? Boolean(cityProvinceId && cityName.trim()) : Boolean(tid);

  async function addTerritory() {
    if (!canAdd) return;
    try {
      setSaving(true);
      if (ttype === "ciudad") {
        // Las ciudades no vienen sembradas: se crea (o reutiliza) al vuelo.
        const city = await adminAPI.geoCreateCity(cityName.trim(), Number(cityProvinceId));
        await adminAPI.orgAddTerritory(unit.id, "ciudad", city.id);
      } else {
        await adminAPI.orgAddTerritory(unit.id, ttype, Number(tid));
      }
      resetForm();
      reload();
    } catch (e) {
      alert(e?.message || "No se pudo añadir el territorio");
    } finally {
      setSaving(false);
    }
  }

  const provinceOptions = provinces.map((p) => ({ value: String(p.id), label: p.name }));

  return (
    <Modal opened onClose={onClose} title={`Territorio de "${unit.name}"`} size="lg">
      {loading ? <Loader /> : (
        <>
          <Text size="xs" c="dimmed" mb="sm">
            La provincia determina a qué visitantes se muestran los eventos públicos
            de esta unidad
          </Text>
          <Stack gap="xs" mb="md">
            {rows.length === 0 && <Text size="sm" c="dimmed">Sin territorios asignados.</Text>}
            {rows.map((r) => (
              <Group key={r.id} justify="space-between">
                <Text size="sm">{r.label} <Badge size="xs" variant="light">{r.territory_type}</Badge></Text>
                <Button size="compact-xs" color="red" variant="subtle"
                  onClick={async () => { await adminAPI.orgDeleteTerritory(r.id); reload(); }}>
                  Quitar
                </Button>
              </Group>
            ))}
          </Stack>
          <Divider mb="md" />

          <Select label="Tipo de ámbito" mb="sm" data={[
            { value: "comunidad_autonoma", label: "Comunidad autónoma" },
            { value: "provincia", label: "Provincia" },
            { value: "ciudad", label: "Ciudad" },
          ]} value={ttype} onChange={(v) => { setTtype(v); resetForm(); }} allowDeselect={false} />

          {ttype === "comunidad_autonoma" && (
            <Select label="Comunidad autónoma" searchable mb="sm"
              data={communities.map((c) => ({ value: String(c.id), label: c.name }))}
              value={tid} onChange={setTid} />
          )}

          {ttype === "provincia" && (
            <Select label="Provincia" searchable mb="sm"
              data={provinceOptions} value={tid} onChange={setTid} />
          )}

          {ttype === "ciudad" && (
            <>
              <Select label="Provincia de la ciudad" searchable mb="sm"
                data={provinceOptions}
                value={cityProvinceId ? String(cityProvinceId) : null}
                onChange={(v) => v && loadCitiesFor(v)} />
              <TextInput label="Ciudad" placeholder="Escribe el nombre de la ciudad"
                description={cities.length ? `Ya registradas: ${cities.map((c) => c.name).join(", ")}` : "Se creará si no existe."}
                value={cityName} onChange={(e) => setCityName(e.target.value)}
                disabled={!cityProvinceId} mb="sm" />
            </>
          )}

          <Group justify="flex-end">
            <Button onClick={addTerritory} loading={saving} disabled={!canAdd}>
              Añadir territorio
            </Button>
          </Group>
        </>
      )}
    </Modal>
  );
}

function UnitMembersModal({ unit, onClose }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        setMembers(await adminAPI.usersInUnit(unit.id));
      } catch (e) {
        setMembers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [unit.id]);
  return (
    <Modal opened onClose={onClose} title={`Personas en "${unit.name}"`}>
      {loading ? <Loader /> : members.length === 0 ? (
        <Text size="sm" c="dimmed">No hay personas en esta unidad.</Text>
      ) : (
        <Stack gap={4}>
          {members.map((m) => (
            <Text key={m.id} size="sm">{m.full_name} · {m.email} <Badge size="xs" variant="light">{m.role}</Badge></Text>
          ))}
        </Stack>
      )}
    </Modal>
  );
}
