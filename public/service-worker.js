/* pi-crust service worker — shell-only cache.
 *
 * CRITICAL: this SW must never intercept or cache the live data plane.
 * pi-crust streams agent output over SSE and Socket.IO; caching or buffering
 * those would freeze the conversation. We:
 *   - bypass /api, SSE, websockets, and the Vite dev client entirely
 *   - cache only same-origin static GET requests (the app shell + assets)
 *   - use network-first for navigations so a deploy is picked up promptly,
 *     falling back to the cached shell when offline.
 *
 * Note: service workers only register in a secure context (HTTPS or
 * localhost). Over plain HTTP on a tailnet this file is simply never
 * activated; the registration code no-ops. It "just works" once HTTPS
 * (e.g. `tailscale serve`) is in front of pi-crust.
 */
const CACHE = "pi-crust-shell-v1";
const SHELL = ["/", "/index.html", "/favicon.svg", "/manifest.webmanifest", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Paths we must never touch — the live data plane and dev tooling.
function isBypassed(url) {
  return (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/socket.io") ||
    url.pathname.startsWith("/sse") ||
    url.pathname.startsWith("/@vite") ||
    url.pathname.startsWith("/@react-refresh") ||
    url.pathname.includes("vite-hmr") ||
    url.pathname.endsWith("/events")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never cache mutations
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // third-party untouched
  if (isBypassed(url)) return; // live plane → straight to network
  if (req.headers.get("accept")?.includes("text/event-stream")) return; // SSE

  // Navigations: network-first, fall back to cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/index.html").then((m) => m || caches.match("/"))),
    );
    return;
  }

  // Static assets: cache-first, populate on miss.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }),
    ),
  );
});

// Phase-2 placeholder: Web Push handlers will live here once VAPID +
// server-side web-push are wired. Left intentionally minimal for now.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "π crust", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "π crust", {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: payload.data || {},
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cls) => {
      for (const c of cls) {
        if (c.url.includes(target) && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
