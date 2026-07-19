// Notificaciones (toasts) coherentes en toda la app. Sustituyen a los alert()
// nativos, que rompen la estética Material y en la APK se ven como diálogos del
// sistema. En la Fase 4 el wrapper de errores centralizado se apoyará en esto.
import { notifications } from "@mantine/notifications";
import { IconCheck, IconX, IconInfoCircle } from "@tabler/icons-react";
import React from "react";

export function notifyError(message, title = "Error") {
  notifications.show({
    color: "red",
    title,
    message: message || "Algo no ha ido bien. Inténtalo de nuevo.",
    icon: React.createElement(IconX, { size: 18 }),
  });
}

export function notifySuccess(message, title) {
  notifications.show({
    color: "teal",
    title,
    message,
    icon: React.createElement(IconCheck, { size: 18 }),
  });
}

export function notifyInfo(message, title) {
  notifications.show({
    color: "blue",
    title,
    message,
    icon: React.createElement(IconInfoCircle, { size: 18 }),
  });
}
