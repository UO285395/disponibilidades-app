import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authAPI, clearToken, getToken, userAPI } from "../api/api.js";

// Centraliza el bootstrap de sesion que antes estaba duplicado en
// Dashboard.jsx y AdminDashboard.jsx: valida token -> GET /me -> si falla,
// intenta /auth/refresh y reintenta /me una sola vez -> si sigue fallando,
// limpia la sesion y redirige a login una unica vez.
//
// Devuelve { user, ready }. `ready` pasa a true en cuanto termina el intento
// inicial (exito o fallo), para que la pantalla pueda mostrar un estado breve
// de "comprobando sesion" en vez de quedarse en blanco.
export function useSessionUser({ requireAdmin = false, adminRedirectTo = "/dashboard", onLoaded } = {}) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    mountedRef.current = true;

    if (!getToken()) {
      navigate("/");
      return () => {
        mountedRef.current = false;
      };
    }

    async function resolveUser() {
      const u = await userAPI.me();
      if (requireAdmin && u.role !== "admin" && u.role !== "superadmin") {
        navigate(adminRedirectTo);
        return null;
      }
      return u;
    }

    (async () => {
      try {
        const u = await resolveUser();
        if (!mountedRef.current) return;
        if (u) {
          setUser(u);
          onLoadedRef.current?.(u);
        }
      } catch {
        try {
          await authAPI.refresh();
          const u = await resolveUser();
          if (!mountedRef.current) return;
          if (u) {
            setUser(u);
            onLoadedRef.current?.(u);
          }
        } catch {
          await clearToken();
          if (mountedRef.current) navigate("/");
        }
      } finally {
        if (mountedRef.current) setReady(true);
      }
    })();

    return () => {
      mountedRef.current = false;
    };
  }, [navigate, requireAdmin, adminRedirectTo]);

  return { user, ready };
}
