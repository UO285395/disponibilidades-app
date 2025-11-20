import { useState } from "react";
import { TextInput, PasswordInput, Button, Card, Title } from "@mantine/core";
import { authAPI } from "../api/api.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin() {
    try {
      await authAPI.login(email, password);
      window.location = "/dashboard";
    } catch (e) {
      alert("Error: " + e.message);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "80px auto" }}>
      <Card shadow="md" padding="lg" radius="md">
        <Title order={2} align="center" mb="lg">Iniciar sesión</Title>

        <TextInput
          label="Email"
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

        <Button fullWidth mt="md" onClick={handleLogin}>
          Entrar
        </Button>
      </Card>
    </div>
  );
}
