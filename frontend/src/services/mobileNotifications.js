import { Capacitor } from "@capacitor/core";
import { deviceAPI } from "../api/api.js";

let initialized = false;

export async function initMobileNotifications() {
  if (initialized) return;
  if (!Capacitor.isNativePlatform()) return;

  let PushNotifications;
  try {
    ({ PushNotifications } = await import("@capacitor/push-notifications"));
  } catch (e) {
    console.error("Push plugin no disponible", e);
    return;
  }

  initialized = true;

  PushNotifications.addListener("registration", async (token) => {
    try {
      await deviceAPI.registerToken(token.value, "android", null);
    } catch (error) {
      console.error("No se pudo registrar el token push en backend", error);
    }
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

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive === "granted") {
    await PushNotifications.register();
  }
}
