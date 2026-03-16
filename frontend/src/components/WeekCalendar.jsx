import { useEffect, useState } from "react";
import { Card, Table, Text, ScrollArea, Grid, Title } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
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

export default function WeekCalendar({ offsetWeeks = 0 }) {
  const [availabilities, setAvailabilities] = useState([]);
  const [updatingKey, setUpdatingKey] = useState(null);

  const baseWeekStart = startOfWeek(new Date());
  const weekStart = addDays(baseWeekStart, offsetWeeks * 7);

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

  function isAvailable(date, hour) {
    return availabilities.some((a) => {
      const h = Number(hour);
      const start = Number(a.start_time.slice(0, 2));
      const end = Number(a.end_time.slice(0, 2));
      return a.date === date && h >= start && h < end;
    });
  }

  async function toggleCell(date, hour) {
    const h = parseInt(hour);
    const key = `${date}-${h}`;

    // Evitar clicks repetidos mientras se procesa esta celda
    if (updatingKey === key) return;
    setUpdatingKey(key);

    const exist = availabilities.find((a) => {
      const start = parseInt(a.start_time.slice(0, 2));
      const end = parseInt(a.end_time.slice(0, 2));
      return a.date === date && h >= start && h < end;
    });

    // --- UI Optimista ---
    try {
      if (exist) {
        // Eliminar en backend y luego refrescar desde servidor
        await availabilityAPI.delete(exist.id);
      } else {
        // Crear en backend y luego refrescar desde servidor
        await availabilityAPI.create(
          date,
          `${pad2(hour)}:00:00`,
          `${pad2(hour + 1)}:00:00`
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      await loadAvailability();
      setUpdatingKey(null);
    }
  }

async function loadAvailability() {
  const data = await availabilityAPI.listMine();
  setAvailabilities(data);
}



  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: 15 }, (_, h) => h + 8);
  const isMobile = useMediaQuery("(max-width: 900px)");

  if (isMobile) {
    return (
      <Card shadow="md" p="sm" radius="md">
        <Title order={4} mb="xs">
          Disponibilidad semanal
        </Title>
        <ScrollArea style={{ maxHeight: "calc(100vh - 200px)" }} type="auto">
          <Grid gutter="xs">
            {days.map((d) => {
              const dayString = formatISO(d);
              return (
                <Grid.Col xs={12} sm={6} key={dayString}>
                  <Card withBorder p="xs" radius="md" style={{ minHeight: 200 }}>
                    <Text weight={700} size="sm" mb="xs">
                      {d.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit" })}
                    </Text>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                        gap: 4,
                      }}
                    >
                      {hours.map((hour) => {
                        const active = isAvailable(dayString, hour);
                        return (
                          <button
                            key={`${dayString}-${hour}`}
                            onClick={() => toggleCell(dayString, hour)}
                            style={{
                              background: active ? "#abf5d1" : "#f0f0f0",
                              border: "1px solid #d0d0d0",
                              borderRadius: 4,
                              padding: "6px 4px",
                              fontSize: 10,
                              cursor: "pointer",
                              minHeight: 32,
                            }}
                            aria-label={`${dayString} ${hour}:00`}
                          >
                            {pad2(hour)}:00
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                </Grid.Col>
              );
            })}
          </Grid>
        </ScrollArea>
      </Card>
    );
  }

  return (
    <Card shadow="md" p="lg" radius="md">
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
                }}
              >
                Hora
              </Table.Th>
              {days.map((d, i) => (
                <Table.Th key={i}>
                  {d.toLocaleDateString("es-ES", {
                    weekday: "short",
                    day: "2-digit",
                  })}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {hours.map((hour) => (
              <Table.Tr key={hour}>
                <Table.Td>{pad2(hour)}:00 - {pad2(hour + 1)}:00</Table.Td>
                {days.map((d, idx) => {
                  const date = formatISO(d);
                  const active = isAvailable(date, hour);
                  return (
                    <Table.Td
                      key={idx}
                      onClick={() => toggleCell(date, hour)}
                      style={{
                        cursor: "pointer",
                        background: active ? "#abf5d1" : undefined,
                      }}
                    />
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
