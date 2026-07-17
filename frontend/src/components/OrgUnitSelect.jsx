import { useEffect, useState } from "react";
import { Select } from "@mantine/core";
import { getOrgTree } from "../api/orgTreeCache.js";

// Selector jerárquico de unidades del organigrama con búsqueda incremental.
// Sustituye a los antiguos filtros por dominio (la parte derecha del @).
// Solo ofrece unidades sobre las que el admin tiene autoridad, porque
// /admin/org/tree ya devuelve su subárbol autorizado.
export default function OrgUnitSelect({
  value,
  onChange,
  label = "Ámbito",
  description,
  placeholder = "Todas",
  clearable = true,
  activeOnly = true,
  ...props
}) {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getOrgTree()
      .then((tree) => {
        if (!active) return;
        setUnits(activeOnly ? tree.filter((u) => u.is_active) : tree);
      })
      .catch(() => {
        if (active) setUnits([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [activeOnly]);

  // La sangría refleja el nivel dentro de la jerarquía; el texto del nivel
  // permite además buscar por tipo (p. ej. escribir "regional").
  const data = units.map((u) => ({
    value: String(u.id),
    label: `${"  ".repeat(u.depth)}${u.depth > 0 ? "└ " : ""}${u.name} · ${u.level_label}`,
  }));

  return (
    <Select
      label={label}
      description={description}
      placeholder={loading ? "Cargando estructura…" : placeholder}
      data={data}
      value={value}
      onChange={onChange}
      searchable
      clearable={clearable}
      nothingFoundMessage="Sin coincidencias"
      disabled={loading && units.length === 0}
      {...props}
    />
  );
}
