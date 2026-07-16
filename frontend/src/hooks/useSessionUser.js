import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authAPI, ensureTokenValid, getToken, userAPI } from "../api/api.js";

// Centraliza el bootstrap de sesion que antes estaba duplicado en
// Dashboard.jsx y AdminDashboard.jsx: valida token -> GET /me -> si falla,
// intenta /auth/refresh y reintenta /me una sola vez. Si la sesion no
// existia (nunca hubo token), redirige a "/" en silencio: no es una
// interrupcion, es el estado normal de un visitante. Si la sesion SI existia
// y ha expirado de verdad, no redirige sola -> expone `sessionExpired` para
// que la pagina muestre un modal ("Sesión expirada") y el usuario decida
// cuando volver a loguearse, en vez de un salto brusco a otra pantalla.
//
// Ademas revalida el token (refresco silencioso si quedan <24h) cada vez que
// la pestaña/app vuelve a primer plano, para sesiones APK de larga duracion.
//
// Devuelve { user, ready, sessionExpired }. `ready` pasa a true en cuanto
// termina el intento inicial (exito o fallo), para que la pantalla pueda
// mostrar un estado breve de "comprobando sesion" en vez de quedarse en blanco.
export function useSessionUser({ requireAdmin = false, adminRedirectTo = "/dashboard", onLoaded } = {}) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  const resolveUser = useCallback(async () => {
    const u = await userAPI.me();
    if (requireAdmin && u.role !== "admin" && u.role !== "superadmin") {
      navigate(adminRedirectTo);
      return null;
    }
    return u;
  }, [requireAdmin, adminRedirectTo, navigate]);

  useEffect(() => {
    mountedRef.current = true;

    if (!getToken()) {
      navigate("/");
      return () => {
        mountedRef.current = false;
      };
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
          if (mountedRef.current) setSessionExpired(true);
        }
      } finally {
        if (mountedRef.current) setReady(true);
      }
    })();

    return () => {
      mountedRef.current = false;
    };
  }, [navigate, resolveUser]);

  useEffect(() => {
    function handleFocusOrVisible() {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      if (!getToken()) return;

      ensureTokenValid().then((stillValid) => {
        if (mountedRef.current && !stillValid) setSessionExpired(true);
      });
    }

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);
    return () => {
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
    };
  }, []);

  return { user, ready, sessionExpired };
}
