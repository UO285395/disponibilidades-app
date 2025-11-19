const { execSync } = require("child_process");
const fs = require("fs");

function run(cmd) {
    console.log("\n>>> Ejecutando:", cmd);
    execSync(cmd, { stdio: "inherit" });
}

console.log("\n=== 🚀 CREANDO FRONTEND PROFESIONAL (React + Vite + Chakra + BigCalendar) ===\n");

// 1. Crear proyecto Vite
run("npm create vite@latest . -- --template react");

// 2. Instalar dependencias
run("npm install");
run("npm install react-router-dom axios");
run("npm install @chakra-ui/react @emotion/react @emotion/styled framer-motion");
run("npm install react-big-calendar date-fns");
run("npm install react-icons");

// 3. Crear estructura de carpetas
[
    "src/api",
    "src/pages",
    "src/components"
].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 4. Crear api.js
fs.writeFileSync("src/api/api.js", `
import axios from "axios";

export const API_URL = "http://127.0.0.1:8000";

const api = axios.create({
    baseURL: API_URL,
});

export function setToken(token) {
    localStorage.setItem("token", token);
}
export function getToken() {
    return localStorage.getItem("token");
}

api.interceptors.request.use((config) => {
    const token = getToken();
    if (token) config.headers.Authorization = "Bearer " + token;
    return config;
});

export const authAPI = {
    login: (email, password) => api.post("/login", { email, password })
        .then(r => setToken(r.data.access_token)),
    register: (email, full_name, password) => api.post("/register", { email, full_name, password })
};

export const userAPI = {
    me: () => api.get("/me").then(r => r.data),
    availability: {
        getMine: () => api.get("/availability/my").then(r => r.data),
        create: (d, s, e) => api.post("/availability/my", { date: d, start_time: s, end_time: e }),
        delete: (id) => api.delete("/availability/my/" + id),
    }
};

export const eventsAPI = {
    list: () => api.get("/events").then(r => r.data),
    answer: (id, ans, jus) =>
        api.post("/events/" + id + "/responses", { answer: ans, justification: jus })
};

export const adminAPI = {
    users: () => api.get("/admin/users").then(r => r.data),
    createEvent: (title, description, date, st, et) =>
        api.post("/events", { title, description, date, start_time: st, end_time: et }),
    userAvailability: (id) => api.get("/admin/user/" + id + "/availability").then(r => r.data),
    eventResponses: (id) => api.get("/events/" + id + "/responses").then(r => r.data),
};

export default api;
`);


// 5. Crear Login.jsx
fs.writeFileSync("src/pages/Login.jsx", `
import { useState } from "react";
import { authAPI } from "../api/api";
import { Box, Input, Button, Heading, VStack } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";

export default function Login() {
    const nav = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    async function doLogin() {
        try {
            await authAPI.login(email, password);
            nav("/dashboard");
        } catch (err) {
            alert("Error al iniciar sesión");
        }
    }

    return (
        <Box maxW="350px" mx="auto" mt="100px">
            <Heading mb="20px" textAlign="center">Iniciar sesión</Heading>
            <VStack spacing={3}>
                <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Input placeholder="Contraseña" type="password"
                       value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button colorScheme="blue" w="100%" onClick={doLogin}>Entrar</Button>
                <Button variant="outline" onClick={() => nav("/register")}>Crear cuenta</Button>
            </VStack>
        </Box>
    );
}
`);


// 6. Crear Register.jsx
fs.writeFileSync("src/pages/Register.jsx", `
import { useState } from "react";
import { authAPI } from "../api/api";
import { Box, Input, Button, Heading, VStack } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";

export default function Register() {
    const nav = useNavigate();
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [password, setPassword] = useState("");

    async function doRegister() {
        try {
            await authAPI.register(email, name, password);
            alert("Registrado correctamente");
            nav("/");
        } catch (err) {
            alert("Error al registrarse");
        }
    }

    return (
        <Box maxW="350px" mx="auto" mt="100px">
            <Heading mb="20px" textAlign="center">Registro</Heading>
            <VStack spacing={3}>
                <Input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
                <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Input placeholder="Contraseña" type="password"
                       value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button colorScheme="green" w="100%" onClick={doRegister}>Crear cuenta</Button>
            </VStack>
        </Box>
    );
}
`);


// 7. Crear App.jsx
fs.writeFileSync("src/App.jsx", `
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import { ChakraProvider } from "@chakra-ui/react";

export default function App() {
    return (
        <ChakraProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/admin" element={<Admin />} />
                </Routes>
            </BrowserRouter>
        </ChakraProvider>
    );
}
`);


// 8. Crear archivos vacíos para que no dé error
fs.writeFileSync("src/pages/Dashboard.jsx", `export default function Dashboard(){ return <>Dashboard</> }`);
fs.writeFileSync("src/pages/Admin.jsx", `export default function Admin(){ return <>Admin Panel</> }`);

console.log("\n=== ✅ FRONTEND MODERNO GENERADO ===");
console.log("Ahora ejecuta:");
console.log("   cd frontend");
console.log("   npm run dev");
