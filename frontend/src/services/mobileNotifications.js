import { Capacitor } from "@capacitor/core";
import { deviceAPI, getToken, subscribeAuthChanges } from "../api/api.js";

let listenersAttached = false;
let lastToken = null;

async function registerCurrentToken() {
  if (!lastToken) return;

  try {
    // Con sesión, el backend infiere rol y dominio del propio usuario.
    // Sin sesión, hay que declarar explícitamente user_role=guest.
    const userRole = getToken() ? null : "guest";
    await deviceAPI.registerToken(lastToken, "android", null, userRole);
  } catch (error) {
    console.error("No se pudo registrar el token push en backend", error);
  }
}

// Se puede llamar sin sesión (invitado navegando la APK) o con sesión
// (militante). Los listeners del plugin nativo solo se registran una vez;
// en cada cambio de sesión (login/logout) se reenvía el mismo token para
// que el backend actualice a quién pertenece.
export async function initMobileNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  if (listenersAttached) {
    await registerCurrentToken();
    return;
  }

  let PushNotifications;
  try {
    ({ PushNotifications } = await import("@capacitor/push-notifications"));
  } catch (e) {
    console.error("Push plugin no disponible", e);
    return;
  }

  listenersAttached = true;

  PushNotifications.addListener("registration", async (token) => {
    lastToken = token.value;
    await registerCurrentToken();
  });

  PushNotifications.addListener("registrationError", (error) => {
    console.error("Error registrando push", error);
  });

  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("Push recibida", notification);
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    console.log("Push action", action);
  });

  subscribeAuthChanges(() => {
    registerCurrentToken();
  });

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive === "granted") {
    await PushNotifications.register();
  }
}
