import { useEffect, useState } from "react";
import { Card, Table } from "@mantine/core";
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

  const exist = availabilities.find((a) => {
    const start = parseInt(a.start_time.slice(0, 2));
    const end = parseInt(a.end_time.slice(0, 2));
    return a.date === date && h >= start && h < end;
  });

  // --- UI Optimista ---
  if (exist) {
    // Quitar visualmente SIN esperar API
    setAvailabilities((prev) => prev.filter((a) => a.id !== exist.id));

    // Luego eliminar en backend
    try {
      await availabilityAPI.delete(exist.id);
    } catch (err) {
      console.error(err);
      // revertir si falla
      await loadAvailability();
    }
  } else {
    // Añadir visualmente SIN esperar API
   const tmpId = "tmp_" + crypto.randomUUID();

    const newEntry = {
      id: tmpId,
      date,
      start_time: `${pad2(hour)}:00:00`,
      end_time: `${pad2(hour + 1)}:00:00`,
    };

    setAvailabilities((prev) => [...prev, newEntry]);

    // Crear en backend
    try {
      const saved = await availabilityAPI.create(
        date,
        newEntry.start_time,
        newEntry.end_time
      );

      // Reemplazar el temporal con la versión real del backend
      setAvailabilities((prev) =>
        prev.map((a) => (a.id === tmpId ? saved : a))
      );
    } catch (err) {
      console.error(err);
      // revertir si falla
      await loadAvailability();
    }
  }
}

async function loadAvailability() {
  const data = await availabilityAPI.listMine();
  setAvailabilities(data);
}



  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <Card shadow="md" p="lg" radius="md">
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
                      background: active ? "#abf5d1" : undefined
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
