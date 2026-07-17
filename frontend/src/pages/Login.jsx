import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TextInput, PasswordInput, Button, Card, Title, Text, Alert, Box, Stack,
} from "@mantine/core";
import {
  IconArrowLeft, IconMail, IconLock, IconAlertCircle,
} from "@tabler/icons-react";
import { authAPI } from "../api/api.js";

function friendlyError(message) {
  const m = String(message || "");
  if (m.includes("429")) return "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.";
  if (m.includes("400") || m.includes("401")) return "Usuario o contraseña incorrectos.";
  if (m.toLowerCase().includes("failed to fetch")) return "No se pudo conectar. Revisa tu conexión.";
  return "No se pudo iniciar sesión. Inténtalo de nuevo.";
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    if (submitting) return;
    setError("");

    try {
      setSubmitting(true);
      await authAPI.login(email.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(friendlyError(err?.message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh" }} p="md">
      <Button
        variant="subtle"
        size="sm"
        mt="sm"
        pl={4}
        leftSection={<IconArrowLeft size={18} />}
        onClick={() => navigate("/")}
      >
        Volver a eventos
      </Button>

      <Card shadow="sm" padding="lg" mt="lg">
        <Title order={2} ta="center" mb="lg">Iniciar sesión</Title>

        <form onSubmit={handleLogin}>
          <Stack gap="md">
            {error && (
              <Alert color="red" icon={<IconAlertCircle size={18} />} variant="light" p="sm">
                {error}
              </Alert>
            )}

            <TextInput
              label="Usuario"
              placeholder="tu.usuario@colectivo"
              leftSection={<IconMail size={18} />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              required
            />

            <PasswordInput
              label="Contraseña"
              placeholder="Tu contraseña"
              leftSection={<IconLock size={18} />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            <Button fullWidth type="submit" loading={submitting} mt="xs">
              Entrar
            </Button>
          </Stack>
        </form>
      </Card>

      <Text size="xs" c="dimmed" ta="center" mt="lg">
        ¿Problemas para entrar? Contacta con tu responsable de organización.
      </Text>
    </Box>
  );
}
