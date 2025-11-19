import { useEffect, useState } from "react";
import { Card, Table, Title } from "@mantine/core";
import { availabilityAPI } from "../api/api";

export default function WeekCalendar({ offsetWeeks = 0 }) {
  const [availabilities, setAvailabilities] = useState([]);

  // -------------------------------
  // Helpers de fecha
  // -------------------------------
  function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0=domingo, 1=lunes...
    const diff = day === 0 ? -6 : 1 - day; // queremos lunes
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

  // -------------------------------
  // Lógica de disponibilidad
  // -------------------------------
  function isAvailable(date, hour) {
    return availabilities.some((a) => {
      const h = parseInt(hour);
      const start = parseInt(a.start_time.slice(0, 2));
      const end = parseInt(a.end_time.slice(0, 2));
      return a.date === date && h >= start && h < end;
    });
  }

  async function toggleCell(date, hour) {
    const existing = availabilities.find((a) => {
      const h = parseInt(hour);
      const start = parseInt(a.start_time.slice(0, 2));
      const end = parseInt(a.end_time.slice(0, 2));
      return a.date === date && h >= start && h < end;
    });

    if (existing) {
      await availabilityAPI.delete(existing.id);
    } else {
      await availabilityAPI.create(
        date,
        `${pad2(hour)}:00:00`,
        `${pad2(hour + 1)}:00:00`
      );
    }

    await loadAvailability();
  }

  async function loadAvailability() {
    const data = await availabilityAPI.listMine();
    setAvailabilities(data);
  }

  // -------------------------------
  // Cargar disponibilidad una vez
  // -------------------------------
  useEffect(() => {
    loadAvailability();
  }, []);

  // -------------------------------
  // Cálculo de la semana (SIN estado)
  // -------------------------------
  const baseWeekStart = startOfWeek(new Date());
  const weekStart = addDays(baseWeekStart, offsetWeeks * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <Card shadow="md" p="lg" radius="md">
      <Title order={4} mb="md">
        {offsetWeeks === 0 ? "Semana actual" : "Semana siguiente"}
      </Title>

      <Table striped highlightOnHover withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Hora</Table.Th>
            {days.map((d, i) => (
              <Table.Th key={i}>{d.toLocaleDateString("es-ES")}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>

        <Table.Tbody>
          {Array.from({ length: 14 }, (_, h) => h + 8).map((hour) => (
            <Table.Tr key={hour}>
              <Table.Td>{pad2(hour)}:00</Table.Td>

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
    </Card>
  );
}
