import { Capacitor } from "@capacitor/core";

/**
 * Devuelve el origen (https://tu-dominio.com) que se puede compartir como
 * URL pública para el censo, encuestas, etc.
 *
 * Problema: en la APK (Capacitor), window.location.origin devuelve
 * "http://localhost" (Android) o "capacitor://localhost" (iOS), que no son
 * accesibles desde fuera del dispositivo. En esos casos usamos VITE_API_URL
 * como base, ya que en Railway el frontend y el backend comparten dominio.
 */
export function getShareableOrigin() {
  if (Capacitor.isNativePlatform()) {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      try {
        return new URL(apiUrl).origin;
      } catch {
        // URL mal formada — caer al fallback
      }
    }
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}
