import { useEffect, useState } from "react";
import { BrowserRouter, HashRouter, Navigate, Routes, Route } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminEventResponses from "./pages/AdminEventResponses.jsx";
import CensusForm from "./pages/CensusForm.jsx";
import SurveyForm from "./pages/SurveyForm.jsx";
import PublicHome from "./pages/PublicHome.jsx";
import EventDetail from "./pages/EventDetail.jsx";
import { getToken, initializeAuthStorage, subscribeAuthChanges } from "./api/api.js";
import { initMobileNotifications } from "./services/mobileNotifications.js";

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

      initMobileNotifications().catch((error) => {
        console.error("No se pudo inicializar push móvil", error);
      });
    })();

    const unsubscribe = subscribeAuthChanges((nextHasSession) => {
      setHasSession(nextHasSession);
    });

    return unsubscribe;
  }, []);

  if (!ready) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#fff" }}>
      <div style={{ width: 40, height: 40, border: "4px solid #ddd", borderTop: "4px solid #339af0", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );

  return (
    <RouterComponent>
      <Routes>

        <Route path="/" element={hasSession ? <Navigate to="/dashboard" replace /> : <PublicHome />} />
        <Route path="/login" element={hasSession ? <Navigate to="/dashboard" replace /> : <Login />} />

        <Route path="/dashboard" element={hasSession ? <Dashboard /> : <Navigate to="/" replace />} />

        <Route path="/admin" element={hasSession ? <AdminDashboard /> : <Navigate to="/" replace />} />
        <Route path="/admin/event/:id" element={hasSession ? <AdminEventResponses /> : <Navigate to="/" replace />} />

        {/* Rutas públicas — sin autenticación */}
        <Route path="/eventos/:id" element={<EventDetail />} />
        <Route path="/censo/:token" element={<CensusForm />} />
        <Route path="/encuesta/:token" element={<SurveyForm />} />
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </RouterComponent>
  );
}
