import { useEffect, useState } from "react";
import { BrowserRouter, HashRouter, Navigate, Routes, Route } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminEventResponses from "./pages/AdminEventResponses.jsx";
import CensusForm from "./pages/CensusForm.jsx";
import { getToken, initializeAuthStorage } from "./api/api.js";

export default function App() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const RouterComponent = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;

  useEffect(() => {
    (async () => {
      try {
        await initializeAuthStorage();
        setHasSession(Boolean(getToken()));
      } catch (error) {
        console.error("Error inicializando sesion", error);
        setHasSession(false);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) return null;

  return (
    <RouterComponent>
      <Routes>

        <Route path="/" element={hasSession ? <Navigate to="/dashboard" replace /> : <Login />} />

        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/event/:id" element={<AdminEventResponses />} />

        {/* Ruta pública de censo — sin autenticación */}
        <Route path="/censo/:token" element={<CensusForm />} />
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </RouterComponent>
  );
}
