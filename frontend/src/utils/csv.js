// Generación y descarga de CSV en el navegador. Se usa para exportar respuestas
// de eventos y censo. Compatible con Excel (separador ; y BOM UTF-8 para acentos).

function escapeCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[";\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// rows: array de objetos; columns: [{ key, label }]
export function buildCsv(rows, columns) {
  const header = columns.map((c) => escapeCell(c.label)).join(";");
  const body = rows
    .map((row) => columns.map((c) => escapeCell(row[c.key])).join(";"))
    .join("\n");
  return `${header}\n${body}`;
}

export function downloadCsv(filename, rows, columns) {
  const csv = buildCsv(rows, columns);
  // BOM para que Excel interprete UTF-8 y muestre bien los acentos.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
