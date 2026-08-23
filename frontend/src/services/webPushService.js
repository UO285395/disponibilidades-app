/**
 * webPushService.js
 *
 * Gestiona la suscripción web push del navegador:
 *  - Registra el service worker (sw.js)
 *  - Suscribe al navegador usando la clave VAPID del servidor
 *  - Sincroniza la suscripción con el backend
 *  - Permite cancelar la suscripción
 *
 * Compatible con Chrome, Firefox, Edge y Safari (iOS 16.4+ si se instala
 * la app en la pantalla de inicio como PWA).
 */

import { request } from "../api/api.js";

/** ¿Soporta este navegador web push? */
export function isWebPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Registra o reutiliza el service worker de la aplicación. */
async function getServiceWorkerRegistration() {
  // En plataformas nativas (Capacitor) no hay service worker web.
  if (!isWebPushSupported()) return null;

  try {
    // Si ya está registrado, lo devuelve; si no, lo registra.
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (reg) return reg;
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    console.warn("[WebPush] Error registrando service worker:", err);
    return null;
  }
}

/** Convierte una clave pública base64url en Uint8Array para PushManager. */
function base64UrlToUint8Array(base64UrlString) {
  const padding = "=".repeat((4 - (base64UrlString.length % 4)) % 4);
  const base64 = (base64UrlString + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(base64);
  const array = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    array[i] = raw.charCodeAt(i);
  }
  return array;
}

/**
 * Suscribe el navegador a web push y sincroniza con el backend.
 * Devuelve "subscribed" | "denied" | "unsupported" | "error".
 */
export async function activateWebPush() {
  if (!isWebPushSupported()) return "unsupported";

  // Pedir permiso de notificaciones
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "error";

  const reg = await getServiceWorkerRegistration();
  if (!reg) return "error";

  // Esperar a que el SW esté activo
  await navigator.serviceWorker.ready;

  // Obtener la clave pública VAPID del servidor
  let vapidKey;
  try {
    const { public_key } = await request("/web-push/vapid-public-key", "GET", null, false);
    vapidKey = public_key;
  } catch {
    return "error";
  }

  // Suscribir (o reutilizar suscripción existente)
  let subscription;
  try {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(vapidKey),
    });
  } catch (err) {
    console.warn("[WebPush] Error suscribiendo:", err);
    return "error";
  }

  // Enviar suscripción al backend
  const { endpoint, keys } = subscription.toJSON();
  try {
    await request("/web-push/subscribe", "POST", {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
  } catch (err) {
    console.warn("[WebPush] Error guardando suscripción:", err);
    return "error";
  }

  return "subscribed";
}

/**
 * Cancela la suscripción del navegador y la elimina del backend.
 */
export async function deactivateWebPush() {
  if (!isWebPushSupported()) return;

  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return;

  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;

  try {
    await subscription.unsubscribe();
  } catch {
    // Ignorar errores de desuscripción local
  }

  try {
    await request("/web-push/unsubscribe", "DELETE", { endpoint });
  } catch {
    // Ignorar errores de red al desregistrar
  }
}

/**
 * Comprueba si el navegador ya tiene una suscripción push activa.
 */
export async function isWebPushActive() {
  if (!isWebPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
}

/**
 * Registra el service worker en segundo plano (llamar al arrancar la app).
 * No suscribe ni pide permiso; solo prepara el SW para poder suscribir después.
 */
export async function initWebPushServiceWorker() {
  if (!isWebPushSupported()) return;
  // No estamos en plataforma nativa: registrar el SW
  await getServiceWorkerRegistration().catch(() => {});
}
