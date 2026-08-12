/* River Intelligence — service worker
   Caches the app shell so it launches offline. Weather requests (cross-origin
   to Open-Meteo) always go to the network so data stays fresh; when offline the
   app falls back to its own on-device cache. Bump CACHE to force an update. */
const CACHE = "river-intel-v5";
const SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/crest.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./vendor/leaflet.js",
  "./vendor/leaflet.css",
  "./vendor/markercluster.js",
  "./vendor/MarkerCluster.css",
  "./vendor/MarkerCluster.Default.css"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // API proxy calls (auth/session, live data) must NEVER be cached — always
  // hit the network, or a stale signed-out /auth/me is served after sign-in.
  if (url.origin === self.location.origin && url.pathname.startsWith("/bk/")) return;

  // Same-origin app shell: stale-while-revalidate
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }
  // Cross-origin (weather API): network only — let the app handle offline itself.
});

// ---- Web Push: prime-condition alerts ----
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  const title = data.title || "Muddy York Angling Co.";
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || "Conditions are looking good.",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    data: { url: data.url || "./" },
    tag: data.tag || "muddy-alert",
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ("focus" in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
