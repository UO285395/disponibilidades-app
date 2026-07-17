// Formateo de fechas/horas legible para el usuario. La API las guarda como
// "YYYY-MM-DD" y "HH:MM[:SS]"; aquí se muestran en español y de forma clara.

export function formatDate(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = String(isoDate).split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return isoDate;
  return dt.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(value) {
  if (!value) return "";
  const parts = String(value).split(":");
  if (parts.length < 2) return value;
  return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
}
