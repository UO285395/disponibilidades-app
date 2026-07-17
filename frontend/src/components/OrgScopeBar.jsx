import { useEffect, useState } from "react";
import { Group, Badge, Text, Paper } from "@mantine/core";
import { adminAPI } from "../api/adminApi.js";

// Barra persistente que recuerda al admin en qué ámbito está operando, para
// evitar confusiones al gestionar usuarios, eventos o disponibilidades.
export default function OrgScopeBar() {
  const [scope, setScope] = useState(null);

  useEffect(() => {
    let active = true;
    adminAPI.orgScope()
      .then((data) => { if (active) setScope(data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  if (!scope) return null;

  const assignments = scope.assignments || [];
  const home = scope.home_unit;

  return (
    <Paper withBorder p="xs" radius="md" mb="md" bg="var(--mantine-color-gray-0)">
      <Group gap="xs" wrap="wrap">
        <Text size="sm" fw={600}>Ámbito:</Text>
        {assignments.length === 0 && home && (
          <Badge variant="light" color="blue">{home.name} · {home.level_label}</Badge>
        )}
        {assignments.map((a) => (
          <Badge key={a.id} variant="light" color="blue">
            {a.name} · {a.level_label}
          </Badge>
        ))}
        {assignments.length > 1 && (
          <Text size="xs" c="dimmed">(gestionas varias unidades y sus dependientes)</Text>
        )}
      </Group>
    </Paper>
  );
}
