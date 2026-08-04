import { useEffect, useMemo, useState } from "react";
import { SimpleGrid, Text, Stack } from "@mantine/core";

function parseISODate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const HOURS = Array.from({ length: 16 }, (_, index) => index + 8);

export default function EventAvailabilityPicker({ date, fetchSlots, createSlot, deleteSlot, disabled = false }) {
  const [slots, setSlots] = useState([]);
  const [pendingHours, setPendingHours] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, []);

  const isPast = date ? parseISODate(date) < today : false;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const data = await fetchSlots();
        if (!cancelled) setSlots(data || []);
      } catch (error) {
        console.error("Error cargando disponibilidad del evento", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slotByHour = useMemo(() => {
    const map = new Map();
    slots.forEach((slot) => map.set(slot.hour, slot));
    return map;
  }, [slots]);

  async function toggleHour(hour) {
    if (disabled || isPast || pendingHours.has(hour)) return;

    const existing = slotByHour.get(hour);
    setPendingHours((prev) => new Set(prev).add(hour));

    if (existing) {
      setSlots((prev) => prev.filter((slot) => slot.hour !== hour));
      try {
        await deleteSlot(existing.id);
      } catch (error) {
        console.error(error);
        setSlots((prev) => [...prev, existing]);
      } finally {
        setPendingHours((prev) => {
          const next = new Set(prev);
          next.delete(hour);
          return next;
        });
      }
      return;
    }

    try {
      const created = await createSlot(hour);
      setSlots((prev) => [...prev, created]);
    } catch (error) {
      console.error(error);
    } finally {
      setPendingHours((prev) => {
        const next = new Set(prev);
        next.delete(hour);
        return next;
      });
    }
  }

  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        {isPast ? "Este evento ya ha pasado." : "Selecciona las franjas en las que estás disponible."}
      </Text>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        {HOURS.map((hour) => {
          const active = slotByHour.has(hour);
          const pending = pendingHours.has(hour);
          const cellDisabled = disabled || isPast || pending || loading;

          return (
            <button
              key={hour}
              type="button"
              onClick={() => !cellDisabled && toggleHour(hour)}
              disabled={cellDisabled}
              style={{
                border: pending ? "1px solid #f08c00" : active ? "1px solid #2f9e44" : "1px solid #d0d7de",
                borderRadius: 10,
                minHeight: 48,
                padding: "8px 4px",
                textAlign: "center",
                background: pending ? "#ffeaa7" : active ? "#abf5d1" : "#ffffff",
                color: "#1f2328",
                cursor: cellDisabled ? "not-allowed" : "pointer",
                opacity: pending || (isPast && !active) ? 0.75 : 1,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {hour}-{hour + 1}
            </button>
          );
        })}
      </div>
    </Stack>
  );
}
