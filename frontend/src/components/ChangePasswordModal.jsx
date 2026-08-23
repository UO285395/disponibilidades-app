import { useState } from "react";
import { Modal, Button, PasswordInput, Group, Alert } from "@mantine/core";
import { authAPI } from "../api/api.js";

export default function ChangePasswordModal({ opened, onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleChangePassword = async () => {
    setMessage(null);
    setError(null);

    // Validaciones
    if (!currentPassword) {
      setError("Ingresa tu contraseña actual");
      return;
    }
    if (!newPassword) {
      setError("Ingresa la nueva contraseña");
      return;
    }
    if (!confirmPassword) {
      setError("Confirma la nueva contraseña");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las nuevas contraseñas no coinciden");
      return;
    }
    if (newPassword.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);
    try {
      await authAPI.changePassword(currentPassword, newPassword, confirmPassword);
      setMessage("Contraseña actualizada correctamente");
      setTimeout(() => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || "Error al cambiar la contraseña");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Cambiar contraseña"
      centered
      size="sm"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}
        {message && (
          <Alert color="green" title="Éxito">
            {message}
          </Alert>
        )}

        <PasswordInput
          label="Contraseña actual"
          placeholder="Ingresa tu contraseña actual"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.currentTarget.value)}
          disabled={loading}
        />

        <PasswordInput
          label="Nueva contraseña"
          placeholder="Ingresa la nueva contraseña"
          value={newPassword}
          onChange={(e) => setNewPassword(e.currentTarget.value)}
          disabled={loading}
        />

        <PasswordInput
          label="Confirmar nueva contraseña"
          placeholder="Confirma la nueva contraseña"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.currentTarget.value)}
          disabled={loading}
        />

        <Group justify="flex-end" mt="md">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleChangePassword}
            loading={loading}
          >
            Cambiar contraseña
          </Button>
        </Group>
      </div>
    </Modal>
  );
}
