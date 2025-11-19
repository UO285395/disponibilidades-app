import { useState } from "react";
import { authAPI } from "../api/api";
import { Box, Input, Button, Heading, VStack } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";

export default function Register() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");

  async function doRegister() {
    try {
      await authAPI.register(email, fullName, password);
      alert("Usuario registrado. Inicia sesión.");
      nav("/");
    } catch (e) {
      alert("Error al registrarse");
      console.error(e);
    }
  }

  return (
    <Box maxW="350px" mx="auto" mt="100px">
      <Heading textAlign="center" mb={4}>
        Registro
      </Heading>

      <VStack spacing={3}>
        <Input
          placeholder="Nombre completo"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <Input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Input
          placeholder="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button colorScheme="green" w="100%" onClick={doRegister}>
          Crear cuenta
        </Button>
      </VStack>
    </Box>
  );
}
