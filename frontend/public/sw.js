// Service Worker — Disponibilidades
// Gestiona notificaciones push web (VAPID) y el precacheo básico de la PWA.
// Compatible con Chrome, Firefox, Edge y Safari (iOS 16.4+ al instalar como app).

const CACHE_NAME = "disponibilidades-v1";

// ── Instalación ────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  // Activa inmediatamente sin esperar a que se cierre la pestaña anterior.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Push notifications ─────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Disponibilidades", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Disponibilidades";
  const options = {
    body: payload.body || "",
    icon: "/vite.svg",
    badge: "/vite.svg",
    data: { url: payload.url || "/" },
    vibrate: [200, 100, 200],
    requireInteraction: false,
    tag: "disponibilidades-push",
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Clic en la notificación ────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Si ya hay una pestaña abierta, enfócala.
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if (client.navigate) client.navigate(targetUrl);
            return;
          }
        }
        // Si no hay ninguna, abre una nueva.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
