import { useEffect, useMemo, useState } from "react";
import { Badge, Card, Group, SimpleGrid, Text } from "@mantine/core";
import { availabilityAPI } from "../api/api.js";

function startOfWeek(date) {
  const value = new Date(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function pad2(value) {
  return value.toString().padStart(2, "0");
}

function formatISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseISODate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export default function MobileWeekCalendar({ offsetWeeks = 0 }) {
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
      } catch (error) {
        console.error("Error cargando disponibilidad", error);
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

    const key = `${date}-${hour}`;
    if (pendingKeys.has(key)) return;

    const existing = availabilityByCell.get(key);

    if (existing) {
      const reservedKeys = keysForAvailability(existing);

      setAvailabilities((prev) => prev.filter((availability) => availability.id !== existing.id));
      setPendingKeys((prev) => {
        const next = new Set(prev);
        reservedKeys.forEach((reservedKey) => next.add(reservedKey));
        return next;
      });

      try {
        await availabilityAPI.delete(existing.id);
      } catch (error) {
        console.error(error);
        setAvailabilities((prev) => [...prev, existing]);
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
        prev.map((availability) => (availability.id === tempId ? created : availability))
      );
    } catch (error) {
      console.error(error);
      setAvailabilities((prev) => prev.filter((availability) => availability.id !== tempId));
    } finally {
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const hours = Array.from({ length: 16 }, (_, index) => index + 8);

  return (
    <Card shadow="md" p="lg" radius="md">
      <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">
        {days.map((day) => {
          const date = formatISO(day);
          const expired = isPastDate(date);

          return (
            <Card
              key={date}
              withBorder
              radius="md"
              padding="md"
              style={{
                background: expired ? "#f8f9fa" : "#ffffff",
                opacity: expired ? 0.8 : 1,
              }}
            >
              <Group justify="space-between" mb="sm">
                <div>
                  <Text fw={700}>
                    {day.toLocaleDateString("es-ES", {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                    })}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {expired ? "Día vencido" : "Selecciona franjas"}
                  </Text>
                </div>
                {expired && <Badge color="gray">Vencido</Badge>}
              </Group>

              {!expired && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 8,
                  }}
                >
                  {hours.map((hour) => {
                    const key = `${date}-${hour}`;
                    const active = isAvailable(date, hour);
                    const pending = pendingKeys.has(key);
                    const disabled = pending;

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => !disabled && toggleCell(date, hour)}
                        disabled={disabled}
                        style={{
                          border: pending ? "1px solid #f08c00" : active ? "1px solid #2f9e44" : "1px solid #d0d7de",
                          borderRadius: 10,
                          minHeight: 48,
                          padding: "8px 4px",
                          textAlign: "center",
                          background: pending ? "#ffeaa7" : active ? "#abf5d1" : "#ffffff",
                          color: "#1f2328",
                          cursor: disabled ? "not-allowed" : "pointer",
                          opacity: pending ? 0.75 : 1,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {hour}-{hour + 1}
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </SimpleGrid>
    </Card>
  );
}