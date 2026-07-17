import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Button, TextInput, Title, Textarea, Text, Group, Select, Badge, MultiSelect } from "@mantine/core";
import { adminAPI } from "../api/adminApi.js";
import { getOrgTree } from "../api/orgTreeCache.js";
import OrgUnitSelect from "./OrgUnitSelect.jsx";
import { useNavigate } from "react-router-dom";

const VISIBILITY_OPTIONS = [
  { value: "internal", label: "Interno (tu dominio, o el colectivo que indiques abajo)" },
  { value: "public", label: "Público (visible sin cuenta)" },
];

const DISTRIBUTION_OPTIONS = [
  { value: "subtree", label: "Esta estructura y todas sus dependientes" },
  { value: "unit_only", label: "Solo esta estructura" },
  { value: "custom", label: "Estructuras específicas" },
];

const EVENT_TYPE_OPTIONS = [
  { value: "participativo", label: "Participativo (pide respuesta sí/no)" },
  { value: "informativo", label: "Informativo" },
];

const VISIBILITY_BADGE = {
  public: { label: "Público", color: "teal" },
  internal: { label: "Interno", color: "blue" },
  private: { label: "Privado", color: "gray" },
};

export default function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(null);
  const [startTime, setStartTime] = useState("");
  const [visibility, setVisibility] = useState("internal");
  const [eventType, setEventType] = useState("participativo");
  const [location, setLocation] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [orgUnits, setOrgUnits] = useState([]);
  const [orgUnitId, setOrgUnitId] = useState(null);
  const [distributionMode, setDistributionMode] = useState("unit_only");
  const [targetUnitIds, setTargetUnitIds] = useState([]);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editOrgUnitId, setEditOrgUnitId] = useState(null);
  const [editDistributionMode, setEditDistributionMode] = useState("unit_only");
  const [editVisibility, setEditVisibility] = useState("internal");
  const [editEventType, setEditEventType] = useState("participativo");
  const [editLocation, setEditLocation] = useState("");
  const [editExternalUrl, setEditExternalUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const loadingRef = useRef(false);

  // Nombre de unidad por id, para mostrar el ámbito de cada evento.
  const unitNameById = Object.fromEntries(orgUnits.map((u) => [u.id, u.name]));

  const reload = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const data = await adminAPI.listEvents();
      if (mountedRef.current) setEvents(data);
    } catch (e) {
      console.error("Error cargando eventos", e);
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    reload();
    // Cargar el árbol de unidades que el admin puede administrar (para elegir
    // unidad propietaria y modo de distribución del evento).
    // Caché compartida: el OrgUnitSelect de este mismo formulario ya lo pide,
    // así que ambos se sirven de una única petición.
    getOrgTree()
      .then((units) => {
        if (!mountedRef.current) return;
        const active = units.filter((u) => u.is_active);
        setOrgUnits(active);
        if (active.length) {
          setOrgUnitId((prev) => (prev === null ? String(active[0].id) : prev));
        }
      })
      .catch(() => {});
    return () => {
      mountedRef.current = false;
    };
  }, [reload]);

  // Refresco silencioso al volver a la pestaña/app, para reflejar altas/bajas
  // hechas desde otra sesión sin depender de una recarga manual.
  useEffect(() => {
    function handleFocusOrVisible() {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      reload();
    }

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);
    return () => {
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
    };
  }, [reload]);

  async function createEvent() {
    if (!title || !date || creating) return;

    const isoDate = typeof date === "string" ? date : date instanceof Date ? date.toISOString().slice(0, 10) : "";

    try {
      setCreating(true);
      // El alcance ya no sale del dominio del email: lo define la unidad del
      // organigrama y su modo de distribución.
      await adminAPI.createEvent({
        title,
        description: description || null,
        date: isoDate,
        start_time: startTime || null,
        allowed_domain: null,
        visibility,
        event_type: eventType,
        location: location || null,
        external_url: externalUrl || null,
        org_unit_id: orgUnitId ? Number(orgUnitId) : null,
        distribution_mode: distributionMode,
        target_unit_ids: distributionMode === "custom" ? targetUnitIds.map(Number) : null,
      });

      setTitle("");
      setDescription("");
      setDate(null);
      setStartTime("");
      setVisibility("internal");
      setEventType("participativo");
      setLocation("");
      setExternalUrl("");
      setDistributionMode("unit_only");
      setTargetUnitIds([]);
      await reload();
    } catch (e) {
      console.error("Error creando evento", e);
      alert(e?.message || "Error creando evento");
    } finally {
      setCreating(false);
    }
  }

  async function deleteEvent(id) {
    if (deletingId !== null) return;

    const confirmed = window.confirm("¿Seguro que quieres eliminar este evento? Esta acción no se puede deshacer.");
    if (!confirmed) return;

    try {
      setDeletingId(id);
      await adminAPI.deleteEvent(id);
      await reload();
    } catch (e) {
      console.error("Error eliminando evento", e);
      alert(e?.message || "Error eliminando evento");
    } finally {
      setDeletingId(null);
    }
  }

  function startEdit(ev) {
    setEditingEventId(ev.id);
    setEditTitle(ev.title || "");
    setEditDescription(ev.description || "");
    setEditDate(ev.date || "");
    setEditStartTime(ev.start_time || "");
    setEditOrgUnitId(ev.org_unit_id ? String(ev.org_unit_id) : null);
    setEditDistributionMode(ev.distribution_mode || "unit_only");
    setEditVisibility(ev.visibility || "internal");
    setEditEventType(ev.event_type || "participativo");
    setEditLocation(ev.location || "");
    setEditExternalUrl(ev.external_url || "");
  }

  function cancelEdit() {
    setEditingEventId(null);
    setEditTitle("");
    setEditDescription("");
    setEditDate("");
    setEditStartTime("");
    setEditOrgUnitId(null);
    setEditDistributionMode("unit_only");
    setEditVisibility("internal");
    setEditEventType("participativo");
    setEditLocation("");
    setEditExternalUrl("");
  }

  async function saveEdit() {
    if (!editingEventId || !editTitle || !editDate || savingEdit) return;

    try {
      setSavingEdit(true);
      await adminAPI.editEvent(editingEventId, {
        title: editTitle,
        description: editDescription || null,
        date: editDate,
        start_time: editStartTime || null,
        allowed_domain: null,
        visibility: editVisibility,
        event_type: editEventType,
        location: editLocation || null,
        external_url: editExternalUrl || null,
        org_unit_id: editOrgUnitId ? Number(editOrgUnitId) : null,
        distribution_mode: editDistributionMode,
      });
      cancelEdit();
      await reload();
    } catch (e) {
      console.error("Error editando evento", e);
      alert(e?.message || "Error editando evento");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <>
      <Title order={3} mb="md">
        Crear evento
      </Title>

      <Card shadow="sm" p="md" mb="xl">
        <TextInput
          label="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          mb="sm"
        />
        <Textarea
          label="Descripción"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          mb="sm"
        />
        <TextInput
          type="date"
          label="Fecha"
          value={date || ""}
          onChange={(e) => setDate(e.target.value)}
          mb="sm"
        />
        <TextInput
          type="time"
          label="Hora inicio"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          mb="sm"
        />
        <Select
          label="Visibilidad"
          data={VISIBILITY_OPTIONS}
          value={visibility}
          onChange={(v) => setVisibility(v || "internal")}
          allowDeselect={false}
          mb="sm"
        />
        <Select
          label="Tipo de evento"
          data={EVENT_TYPE_OPTIONS}
          value={eventType}
          onChange={(v) => setEventType(v || "participativo")}
          allowDeselect={false}
          mb="sm"
        />
        <TextInput
          label="Ubicación (opcional)"
          placeholder="Plaza Mayor, Madrid"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          mb="sm"
        />
        <TextInput
          label="Enlace externo (opcional)"
          placeholder="https://…"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          mb="sm"
        />

        <OrgUnitSelect
          label="Unidad que organiza"
          description="Unidad del organigrama a la que pertenece el evento."
          placeholder="Selecciona una unidad"
          clearable={false}
          value={orgUnitId}
          onChange={setOrgUnitId}
          mb="sm"
        />
        <Select
          label="Distribución"
          description="A quién llega el evento dentro de la estructura."
          data={DISTRIBUTION_OPTIONS}
          value={distributionMode}
          onChange={(v) => setDistributionMode(v || "unit_only")}
          allowDeselect={false}
          mb="sm"
        />
        {distributionMode === "custom" && (
          <MultiSelect
            label="Unidades destino"
            description="Deben depender de la unidad que organiza."
            data={orgUnits
              .filter((u) => orgUnitId && u.id !== Number(orgUnitId))
              .map((u) => ({ value: String(u.id), label: `${"  ".repeat(u.depth)}${u.name} · ${u.level_label}` }))}
            value={targetUnitIds}
            onChange={setTargetUnitIds}
            searchable
            mb="sm"
          />
        )}

        <Button onClick={createEvent} loading={creating} disabled={creating}>
          Crear evento
        </Button>
      </Card>

      <Title order={3} mb="md">
        Eventos existentes
      </Title>

      {events.length === 0 && (
        <Text size="sm" c="dimmed">
          No hay eventos.
        </Text>
      )}

      {events.map((ev) => {
        return (
          <Card key={ev.id} shadow="sm" p="md" mb="md">
            {editingEventId === ev.id ? (
              <>
                <TextInput
                  label="Titulo"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  mb="sm"
                />
                <Textarea
                  label="Descripcion"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  mb="sm"
                />
                <TextInput
                  type="date"
                  label="Fecha"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  mb="sm"
                />
                <TextInput
                  type="time"
                  label="Hora inicio"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  mb="sm"
                />
                <OrgUnitSelect
                  label="Unidad que organiza"
                  placeholder="Selecciona una unidad"
                  clearable={false}
                  value={editOrgUnitId}
                  onChange={setEditOrgUnitId}
                  mb="sm"
                />
                <Select
                  label="Distribución"
                  data={DISTRIBUTION_OPTIONS}
                  value={editDistributionMode}
                  onChange={(v) => setEditDistributionMode(v || "unit_only")}
                  allowDeselect={false}
                  mb="sm"
                />
                <Select
                  label="Visibilidad"
                  data={VISIBILITY_OPTIONS}
                  value={editVisibility}
                  onChange={(v) => setEditVisibility(v || "internal")}
                  allowDeselect={false}
                  mb="sm"
                />
                <Select
                  label="Tipo de evento"
                  data={EVENT_TYPE_OPTIONS}
                  value={editEventType}
                  onChange={(v) => setEditEventType(v || "participativo")}
                  allowDeselect={false}
                  mb="sm"
                />
                <TextInput
                  label="Ubicación (opcional)"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  mb="sm"
                />
                <TextInput
                  label="Enlace externo (opcional)"
                  value={editExternalUrl}
                  onChange={(e) => setEditExternalUrl(e.target.value)}
                  mb="sm"
                />
              </>
            ) : (
              <>
                <Group gap="xs" align="center">
                  <b>{ev.title}</b>
                  <Text span>- {ev.date}</Text>
                  <Badge size="sm" color={(VISIBILITY_BADGE[ev.visibility] || VISIBILITY_BADGE.internal).color}>
                    {(VISIBILITY_BADGE[ev.visibility] || VISIBILITY_BADGE.internal).label}
                  </Badge>
                </Group>
                {ev.org_unit_id && (
                  <p style={{ margin: "4px 0", color: "#555" }}>
                    Ámbito: <strong>{unitNameById[ev.org_unit_id] || "—"}</strong>
                    {ev.distribution_mode === "subtree" && " (y sus dependientes)"}
                    {ev.distribution_mode === "custom" && " (unidades específicas)"}
                  </p>
                )}
                {ev.location && (
                  <p style={{ margin: "4px 0", color: "#555" }}>
                    Ubicación: <strong>{ev.location}</strong>
                  </p>
                )}
                {ev.description && <p>{ev.description}</p>}
              </>
            )}

            {/* Resumen de votos: militantes y visitantes por separado */}
            <div style={{ marginTop: "10px" }}>
              <b>Militancia:</b>
              <div>Sí: {ev.yes_count ?? 0}</div>
              <div>No: {ev.no_count ?? 0}</div>
              <div>+ Simpas: {ev.companions_total ?? 0}</div>
              <div>Subtotal: {ev.attendees_total ?? 0}</div>

              {ev.visibility === "public" && (
                <>
                  <b style={{ display: "block", marginTop: "8px" }}>Visitantes (sin cuenta):</b>
                  <div>Sí: {ev.guest_yes_count ?? 0}</div>
                  <div>No: {ev.guest_no_count ?? 0}</div>
                  <div>+ Acompañantes: {ev.guest_companions_total ?? 0}</div>
                  <div>Subtotal: {ev.guest_attendees_total ?? 0}</div>
                </>
              )}

              <div style={{ marginTop: "8px" }}>
                <b>Asistencia total: {ev.attendees_grand_total ?? ev.attendees_total ?? 0}</b>
              </div>
            </div>

            <Group mt="sm">
              <Button
                w={130}
                onClick={() => navigate(`/admin/event/${ev.id}`)}
              >
                Ver respuestas
              </Button>

              {editingEventId === ev.id ? (
                <>
                  <Button w={130} color="green" onClick={saveEdit} loading={savingEdit} disabled={savingEdit}>
                    Guardar
                  </Button>
                  <Button w={130} variant="outline" onClick={cancelEdit} disabled={savingEdit}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button w={130} variant="outline" onClick={() => startEdit(ev)} disabled={deletingId !== null}>
                  Editar
                </Button>
              )}

              <Button
                w={130}
                color="red"
                onClick={() => deleteEvent(ev.id)}
                loading={deletingId === ev.id}
                disabled={deletingId !== null}
              >
                Eliminar
              </Button>
            </Group>
          </Card>
        );
      })}
    </>
  );
}
