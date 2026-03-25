import { useEffect, useMemo, useState } from "react";
import { Card, Table, Text } from "@mantine/core";
import { availabilityAPI } from "../api/api.js";

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // lunes
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function pad2(n) {
  return n.toString().padStart(2, "0");
}

function formatISO(d) {
  return d.toISOString().slice(0, 10);
}

function parseISODate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export default function WeekCalendar({ offsetWeeks = 0 }) {
  const [availabilities, setAvailabilities] = useState([]);
  const [pendingKeys, setPendingKeys] = useState(new Set());

  const baseWeekStart = startOfWeek(new Date());
  const weekStart = addDays(baseWeekStart, offsetWeeks * 7);
  const today = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await availabilityAPI.listMine();
        if (!cancelled) setAvailabilities(data);
      } catch (e) {
        console.error("Error cargando disponibilidad", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const availabilityByCell = useMemo(() => {
    const map = new Map();

    for (const availability of availabilities) {
      const start = parseInt(availability.start_time.slice(0, 2), 10);
      const end = parseInt(availability.end_time.slice(0, 2), 10);

      for (let hour = start; hour < end; hour += 1) {
        map.set(`${availability.date}-${hour}`, availability);
      }
    }

    return map;
  }, [availabilities]);

  function keysForAvailability(availability) {
    const start = parseInt(availability.start_time.slice(0, 2), 10);
    const end = parseInt(availability.end_time.slice(0, 2), 10);
    const keys = [];

    for (let hour = start; hour < end; hour += 1) {
      keys.push(`${availability.date}-${hour}`);
    }

    return keys;
  }

  function isAvailable(date, hour) {
    return availabilityByCell.has(`${date}-${hour}`);
  }

  function isPastDate(date) {
    return parseISODate(date) < today;
  }

  async function toggleCell(date, hour) {
    if (isPastDate(date)) return;

    const h = parseInt(hour, 10);
    const key = `${date}-${h}`;

    if (pendingKeys.has(key)) return;

    const exist = availabilityByCell.get(key);

    if (exist) {
      const reservedKeys = keysForAvailability(exist);

      // Optimistic remove
      setAvailabilities((prev) => prev.filter((a) => a.id !== exist.id));
      setPendingKeys((prev) => {
        const next = new Set(prev);
        reservedKeys.forEach((reservedKey) => next.add(reservedKey));
        return next;
      });

      try {
        await availabilityAPI.delete(exist.id);
      } catch (err) {
        console.error(err);
        // Revert on failure
        setAvailabilities((prev) => [...prev, exist]);
      } finally {
        setPendingKeys((prev) => {
          const next = new Set(prev);
          reservedKeys.forEach((reservedKey) => next.delete(reservedKey));
          return next;
        });
      }
      return;
    }

    const tempId = `tmp-${key}`;
    const tempEntry = {
      id: tempId,
      user_id: null,
      date,
      start_time: `${pad2(hour)}:00:00`,
      end_time: `${pad2(hour + 1)}:00:00`,
    };

    setAvailabilities((prev) => [...prev, tempEntry]);
    setPendingKeys((prev) => new Set(prev).add(key));

    try {
      const created = await availabilityAPI.create(
        date,
        `${pad2(hour)}:00:00`,
        `${pad2(hour + 1)}:00:00`
      );

      setAvailabilities((prev) =>
        prev.map((a) => (a.id === tempId ? created : a))
      );
    } catch (err) {
      console.error(err);
      setAvailabilities((prev) => prev.filter((a) => a.id !== tempId));
    } finally {
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }



  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: 16 }, (_, h) => h + 8);

  return (
    <Card shadow="md" p="lg" radius="md">
      <Text size="sm" c="dimmed" mb="sm">
        Los días anteriores a hoy aparecen bloqueados y no admiten votos de disponibilidad.
      </Text>

      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <Table striped highlightOnHover withColumnBorders style={{ minWidth: 900 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th
                style={{
                  position: "sticky",
                  left: 0,
                  background: "white",
                  zIndex: 3,
                  width: "5.5rem",
                  minWidth: "5.5rem",
                  maxWidth: "5.5rem",
                  padding: "6px 8px",
                  whiteSpace: "nowrap",
                }}
              >
                Hora
              </Table.Th>
              {days.map((d, i) => {
                const date = formatISO(d);
                const expired = isPastDate(date);

                return (
                <Table.Th key={i} style={{ opacity: expired ? 0.6 : 1 }}>
                  {d.toLocaleDateString("es-ES", {
                    weekday: "short",
                    day: "2-digit",
                  })}
                  {expired ? " · vencido" : ""}
                </Table.Th>
              );})}
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {hours.map((hour) => (
              <Table.Tr key={hour}>
                <Table.Td
                  style={{
                    position: "sticky",
                    left: 0,
                    background: "white",
                    zIndex: 4,
                    cursor: "default",
                  }}
                >
                  {pad2(hour)}:00 - {pad2(hour + 1)}:00
                </Table.Td>
                {days.map((d, idx) => {
                  const date = formatISO(d);
                  const expired = isPastDate(date);
                  const active = isAvailable(date, hour);
                  const key = `${date}-${hour}`;
                  const pending = pendingKeys.has(key);
                  return (
                    <Table.Td
                      key={idx}
                      onClick={() => !pending && !expired && toggleCell(date, hour)}
                      style={{
                        cursor: pending || expired ? "not-allowed" : "pointer",
                        background: expired
                          ? "#f1f3f5"
                          : pending
                          ? "#ffeaa7"
                          : active
                          ? "#abf5d1"
                          : undefined,
                        color: expired ? "#868e96" : undefined,
                        opacity: pending ? 0.7 : 1,
                      }}
                    >
                      {expired ? "Vencido" : ""}
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
    </Card>
  );
}
