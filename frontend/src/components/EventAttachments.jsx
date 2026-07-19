import { Stack, Anchor, Group, Text } from "@mantine/core";
import { IconPaperclip } from "@tabler/icons-react";

// Muestra los adjuntos (por enlace) de un evento. Solo lectura.
export default function EventAttachments({ attachments, mt = "md" }) {
  if (!Array.isArray(attachments) || attachments.length === 0) return null;

  return (
    <Stack gap={4} mt={mt}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Documentos</Text>
      {attachments.map((att, i) => (
        <Anchor key={i} href={att.url} target="_blank" rel="noreferrer" size="sm">
          <Group gap={6} wrap="nowrap">
            <IconPaperclip size={16} />
            <span>{att.name || att.url}</span>
          </Group>
        </Anchor>
      ))}
    </Stack>
  );
}
