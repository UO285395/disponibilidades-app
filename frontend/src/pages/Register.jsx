import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TextInput,
  PasswordInput,
  Button,
  Card,
  Title
} from "@mantine/core";
import { authAPI } from "../api/api";

export default function Register() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");

  async function doRegister(e) {
    e.preventDefault();

    try {
      await authAPI.register(email, fullName, password);
      alert("Usuario registrado. Inicia sesión.");
      nav("/");
    } catch (err) {
      alert("Error al registrarse");
      console.error(err);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "80px auto" }}>
      <Card shadow="md" padding="lg" radius="md">
        <Title order={2} align="center" mb="lg">
          Registro
        </Title>

        <form onSubmit={doRegister}>
          <TextInput
            label="Apodo"
            placeholder="Apodo / Nombre"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            mb="md"
          />

          <TextInput
            label="Codigo"
            placeholder="UsuarioAA@Colectivo"
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

          <Button fullWidth mt="md" type="submit">
            Crear cuenta
          </Button>
        </form>

        <Button
          variant="subtle"
          mt="md"
          fullWidth
          onClick={() => nav("/")}
        >
          Volver a iniciar sesión
        </Button>
      </Card>
    </div>
  );
}
