import { useEffect, useState } from "react";
import {
  Card,
  Text,
  Title,
  Select,
  TextInput,
  Button,
  Table,
  Group,
  Notification,
} from "@mantine/core";
import { spacesAPI, reservationsAPI } from "../api/api.js";

export default function SpaceReservations() {
  const [spaces, setSpaces] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [spaceId, setSpaceId] = useState(null);
  const [date, setDate] = useState(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [spaceList, reservationList] = await Promise.all([
          spacesAPI.list(),
          reservationsAPI.list(),
        ]);
        setSpaces(spaceList);
        setReservations(reservationList);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  function refresh() {
    Promise.all([spacesAPI.list(), reservationsAPI.list()])
      .then(([spaceList, reservationList]) => {
        setSpaces(spaceList);
        setReservations(reservationList);
      })
      .catch(console.error);
  }

  async function submit() {
    setError("");
    setSuccess("");

    if (!spaceId || !date) {
      setError("Selecciona espacio y fecha.");
      return;
    }

    const dateIso = date instanceof Date ? date.toISOString().slice(0, 10) : date;

    if (startTime && !/^\d{1,2}:\d{2}$/.test(startTime) && !/^\d{1,2}:\d{2}:\d{2}$/.test(startTime)) {
      setError("Formato de hora inicio inválido");
      return;
    }

    if (endTime && !/^\d{1,2}:\d{2}$/.test(endTime) && !/^\d{1,2}:\d{2}:\d{2}$/.test(endTime)) {
      setError("Formato de hora fin inválido");
      return;
    }

    try {
      await reservationsAPI.create(
        spaceId,
        dateIso,
        startTime || null,
        endTime || null,
        reason || null
      );
      setSuccess("Reserva creada");
      setStartTime("");
      setEndTime("");
      setReason("");
      refresh();
    } catch (e) {
      setError(e.message || "Error al crear reserva");
    }
  }

  async function deleteReservation(id) {
    setError("");
    setSuccess("");

    try {
      await reservationsAPI.delete(id);
      setSuccess("Reserva cancelada");
      refresh();
    } catch (e) {
      setError(e.message || "Error al cancelar reserva");
    }
  }

  return (
    <div>
      <Title order={3} mb="md">
        Reserva de espacios
      </Title>

      <Card shadow="sm" p="md" mb="md">
        <Text mb="sm">Selecciona espacio, día, hora de inicio y opcional fin.</Text>

        {error && (
          <Notification color="red" mb="sm" onClose={() => setError("")}> {error} </Notification>
        )}
        {success && (
          <Notification color="green" mb="sm" onClose={() => setSuccess("")}> {success} </Notification>
        )}

        <Group mb="sm">
          <Select
            label="Espacio"
            placeholder="Selecciona un espacio"
            data={spaces.map((s) => ({ value: String(s.id), label: s.name }))}
            value={spaceId ? String(spaceId) : null}
            onChange={(v) => setSpaceId(v ? Number(v) : null)}
            style={{ flex: 1 }}
          />

          <TextInput
            label="Día"
            type="date"
            value={date || ""}
            onChange={(e) => setDate(e.target.value)}
            style={{ flex: 1 }}
            placeholder="Selecciona fecha"
          />
        </Group>

        <Group mb="sm">
          <TextInput
            label="Hora inicio (HH:MM)"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="08:00"
          />
          <TextInput
            label="Hora fin (HH:MM)"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            placeholder="17:00 (opcional: si vacío, fin día)"
          />
          <TextInput
            label="Motivo"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Opcional"
          />
        </Group>

        <Button onClick={submit}>Reservar</Button>
      </Card>

      <Card shadow="sm" p="md">
        <Text mb="sm">Reservas existentes</Text>
        <Table striped highlightOnHover>
          <thead>
            <tr>
              <th>Espacio</th>
              <th>Día</th>
              <th>Desde</th>
              <th>Hasta</th>
              <th>Usuario</th>
              <th>Motivo</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => (
              <tr key={r.id}>
                <td>{r.space_name}</td>
                <td>{r.date}</td>
                <td>{r.start_time}</td>
                <td>{r.end_time}</td>
                <td>{r.creator_name}</td>
                <td>{r.visible_reason ? r.reason : "--"}</td>
                <td>
                  <Button size="xs" color="red" onClick={() => deleteReservation(r.id)}>
                    Cancelar
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
