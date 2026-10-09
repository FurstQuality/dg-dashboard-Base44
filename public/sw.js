/* DG Dashboard service worker — web push + notification click (v2) */
self.addEventListener("install", (e) => {
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  // Drop every old cache on activation so an installed home-screen app never
  // boots a shell from a previous deploy (its page links would 404 on load).
  e.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {}
      await self.clients.claim();
    })(),
  );
});

// Always fetch the app shell from the network in installed apps. Without this
// the browser can hand back a stale document whose page chunks no longer
// exist, which looks like "links do nothing".
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(fetch(req, { cache: "no-store" }).catch(() => fetch(req)));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "DG Dashboard", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "DG Dashboard";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/favicon.ico",
    badge: payload.badge || "/favicon.ico",
    tag: payload.tag,
    data: { url: payload.url || "/", ...(payload.data || {}) },
    requireInteraction: !!payload.requireInteraction,
    silent: !!payload.silent,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let targetUrl = "/";
  try {
    const target = new URL(event.notification.data?.url || "/", self.location.origin);
    if (target.origin === self.location.origin && target.protocol === "https:" ||
        target.origin === self.location.origin && self.location.protocol === "http:") {
      targetUrl = target.href;
    }
  } catch {}
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            client.focus();
            return client.navigate(targetUrl);
          }
        } catch {}
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
