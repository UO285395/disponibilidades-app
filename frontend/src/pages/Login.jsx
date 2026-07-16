import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TextInput,
  PasswordInput,
  Button,
  Card,
  Title
} from "@mantine/core";
import { authAPI } from "../api/api.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault(); // evita recarga al pulsar Enter
    if (submitting) return;

    try {
      setSubmitting(true);
      await authAPI.login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "80px auto" }}>
      <Card shadow="md" padding="lg" radius="md">
        <Button variant="subtle" size="xs" mb="sm" onClick={() => navigate("/")}>
          ← Volver a eventos
        </Button>
        <Title order={2} align="center" mb="lg">
          Iniciar sesión
        </Title>

        {/* FORMULARIO */}
        <form onSubmit={handleLogin}>
          <TextInput
            label="Usuario"
            placeholder="Usuario@Colectivo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            mb="md"
          />

          <PasswordInput
            label="Contraseña"
            placeholder="••••••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            mb="md"
          />

          <Button fullWidth mt="md" type="submit" loading={submitting} disabled={submitting}>
            Entrar
          </Button>
        </form>

      </Card>
    </div>
  );
}