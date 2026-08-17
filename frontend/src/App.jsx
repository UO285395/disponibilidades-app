import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, HashRouter, Navigate, Routes, Route } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Loader, Center } from "@mantine/core";
import Login from "./pages/Login.jsx";
import PublicHome from "./pages/PublicHome.jsx";
import EventDetail from "./pages/EventDetail.jsx";
import { getToken, initializeAuthStorage, subscribeAuthChanges } from "./api/api.js";

// Lo que un visitante NO necesita se carga solo al entrar. El panel de
// administración es la mayor parte del código de la app: un visitante que solo
// mira eventos públicos no debe descargarlo.
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard.jsx"));
const AdminEventResponses = lazy(() => import("./pages/AdminEventResponses.jsx"));
const SurveyForm = lazy(() => import("./pages/SurveyForm.jsx"));

function PageFallback() {
  return (
    <Center h="60vh">
      <Loader />
    </Center>
  );
}

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
      <Suspense fallback={<PageFallback />}>
        <Routes>

          <Route path="/" element={hasSession ? <Navigate to="/dashboard" replace /> : <PublicHome />} />
          <Route path="/login" element={hasSession ? <Navigate to="/dashboard" replace /> : <Login />} />

          <Route path="/dashboard" element={hasSession ? <Dashboard /> : <Navigate to="/" replace />} />

          <Route path="/admin" element={hasSession ? <AdminDashboard /> : <Navigate to="/" replace />} />
          <Route path="/admin/event/:id" element={hasSession ? <AdminEventResponses /> : <Navigate to="/" replace />} />

          {/* Rutas públicas — sin autenticación */}
          <Route path="/eventos/:id" element={<EventDetail />} />
          <Route path="/encuesta/:token" element={<SurveyForm />} />
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </Suspense>
    </RouterComponent>
  );
}
