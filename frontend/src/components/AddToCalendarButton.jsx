import { useState } from "react";
import { Menu, Button } from "@mantine/core";
import { Capacitor } from "@capacitor/core";
import { calendarAPI } from "../api/api.js";

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatLocalCompact(dt) {
  return (
    `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}` +
    `T${pad2(dt.getHours())}${pad2(dt.getMinutes())}00`
  );
}

// URL del formulario "crear evento" de Google Calendar. Funciona en web y en
// móvil (abre la app de Google Calendar si está instalada).
export function buildGoogleCalendarUrl(event) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title || "Evento",
  });

  if (event.start_time) {
    const time = event.start_time.length === 5 ? `${event.start_time}:00` : event.start_time;
    const start = new Date(`${event.date}T${time}`);
    // El modelo no tiene end_time: duración de 1h por defecto (Google exige rango).
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    params.set("dates", `${formatLocalCompact(start)}/${formatLocalCompact(end)}`);
  } else {
    // Evento de día completo: el fin es exclusivo (día siguiente).
    const next = new Date(`${event.date}T00:00:00`);
    next.setDate(next.getDate() + 1);
    const startDay = event.date.replaceAll("-", "");
    const endDay = `${next.getFullYear()}${pad2(next.getMonth() + 1)}${pad2(next.getDate())}`;
    params.set("dates", `${startDay}/${endDay}`);
  }

  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default function AddToCalendarButton({ event, size = "xs", variant = "subtle" }) {
  const [busy, setBusy] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  async function exportIcs() {
    try {
      setBusy(true);
      // En nativo esto abre la hoja de compartir para añadirlo al calendario;
      // en web descarga el .ics.
      await calendarAPI.downloadEvent(event.id);
    } catch (e) {
      alert(e?.message || "No se pudo añadir al calendario");
    } finally {
      setBusy(false);
    }
  }

  // stopPropagation: en PublicHome la card entera navega al detalle al hacer clic.
  const stop = (e) => e.stopPropagation();

  // En móvil, una sola acción clara: compartir el .ics cubre cualquier app de
  // calendario. En web mantenemos también el atajo a Google Calendar.
  if (isNative) {
    return (
      <span onClick={stop}>
        <Button size={size} variant={variant} loading={busy} onClick={exportIcs}>
          📅 Añadir a calendario
        </Button>
      </span>
    );
  }

  return (
    <span onClick={stop}>
      <Menu withinPortal position="bottom-end" shadow="md">
        <Menu.Target>
          <Button size={size} variant={variant} loading={busy}>
            📅 Añadir a calendario
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            component="a"
            href={buildGoogleCalendarUrl(event)}
            target="_blank"
            rel="noreferrer"
          >
            Google Calendar
          </Menu.Item>
          <Menu.Item onClick={exportIcs}>
            Descargar .ics
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </span>
  );
}
