import { Modal, Text, Button, Group } from "@mantine/core";
import { clearToken } from "../api/api.js";

export default function SessionExpiredModal({ opened }) {
  async function goToLogin() {
    await clearToken();
    // Recarga completa a "/" en vez de navegar por cliente: justo tras
    // clearToken(), el `hasSession` de App.jsx aún no se ha re-renderizado,
    // así que un navigate("/login") inmediato choca con el guard de ruta
    // (que todavía ve sesión activa) y rebota de vuelta a /dashboard -> "/".
    // Recargar evita la carrera por completo: todo se reinicia leyendo el
    // token ya borrado. "/" es la única ruta con fallback SPA garantizado
    // en cualquier hosting; desde ahí "Acceso militantes" lleva al login.
    window.location.assign("/");
  }

  return (
    <Modal
      opened={opened}
      onClose={() => {}}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      title="Sesión expirada"
      centered
    >
      <Text size="sm" c="dimmed" mb="md">
        Tu sesión ha caducado. Vuelve a iniciar sesión para continuar.
      </Text>
      <Group justify="flex-end">
        <Button onClick={goToLogin}>Volver a iniciar sesión</Button>
      </Group>
    </Modal>
  );
}
