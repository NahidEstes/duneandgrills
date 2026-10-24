// Served with a deployment/build-specific cache version. No financial offline queue.
const workerSource = `/* This worker deliberately has no Background Sync or financial request queue. */
const VERSION = "__DG_BUILD_VERSION__";
const PREFIX = "dg-pwa-";
const STATIC = \`\${PREFIX}\${VERSION}-static\`;
const MENU = \`\${PREFIX}\${VERSION}-menu\`;
const OFFLINE = ["/offline.html", "/pwa/offline.css", "/pwa/offline.js", "/pwa/icon-192.png", "/pwa/icon-512.png", "/pwa/maskable-512.png", "/pwa/apple-180.png"];
const MAX_AGE = 24 * 60 * 60 * 1000;
let stockSessionRevision = 0;
const MENU_LIMIT = 40;
const STATIC_LIMIT = 180;
const publicMenu = url => ["/api/menu", "/api/categories", "/api/combos"].includes(url.pathname) && [...url.searchParams.keys()].every(key => ["category", "type"].includes(key));
const announce = async data => { for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage(data); };
async function putBounded(name, request, response, limit) {
  const cache = await caches.open(name);
  await cache.put(request, response);
  const keys = (await cache.keys()).filter(key => !OFFLINE.includes(new URL(key.url).pathname));
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map(key => cache.delete(key)));
}
self.addEventListener("install", event => { event.waitUntil(caches.open(STATIC).then(cache => cache.addAll(OFFLINE))); });
self.addEventListener("activate", event => { event.waitUntil((async () => {
  await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && ![STATIC, MENU].includes(key)).map(key => caches.delete(key)));
  await self.clients.claim();
})()); });
self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
  if (event.data?.type === "CLEAR_STOCK_NOTIFICATIONS") {
    stockSessionRevision++;
    event.waitUntil(self.registration.getNotifications().then(notes => { for (const note of notes) if (note.data?.kind === "stock-alert") note.close(); }));
  }
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  const cacheKey = new Request(url.href, { method: "GET", credentials: "omit" });
  if (url.origin !== self.location.origin || request.method !== "GET") return; // Mutations always use the browser's network.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html"))); // Never persist HTML, sessions or RSC.
    return;
  }
  if (publicMenu(url)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.status >= 500) throw new Error("Catalog unavailable");
        if (response.ok && response.headers.get("X-DG-Public-Catalog") === "1" && !response.headers.has("set-cookie")) {
          const headers = new Headers(response.headers); headers.set("X-DG-Cached-At", String(Date.now()));
          const copy = new Response(await response.clone().arrayBuffer(), { status: response.status, headers });
          await putBounded(MENU, cacheKey, copy, MENU_LIMIT);
          await announce({ type: "FRESH_MENU" });
        }
        return response;
      } catch {
        const cached = await caches.match(cacheKey, { cacheName: MENU });
        if (!cached || Date.now() - Number(cached.headers.get("X-DG-Cached-At") || 0) > MAX_AGE) return Response.json({ success: false, message: "Reconnect to load the current menu." }, { status: 503 });
        const headers = new Headers(cached.headers); headers.set("X-DG-Stale", "1");
        await announce({ type: "STALE_MENU" });
        return new Response(cached.body, { status: 200, headers });
      }
    })());
    return;
  }
  if (url.pathname.startsWith("/api/")) return; // All private reads, SSE, status, coupons, rewards and payment endpoints are network-only.
  if (url.pathname.startsWith("/_next/static/") || OFFLINE.includes(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(cacheKey, { cacheName: STATIC });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") await putBounded(STATIC, cacheKey, response.clone(), STATIC_LIMIT);
      return response;
    })());
  }
});

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let data;
    try { data = event.data?.json(); } catch { return; }
    if (data?.type !== "stock-alert" || !/^[a-f0-9]{24}$/i.test(data.notification || "")) return;
    const revision = stockSessionRevision;
    try {
      // Recheck recipient ownership and fresh stock using the current session.
      // No private data is cached or trusted from the push payload.
      const response = await fetch("/api/inventory/stock-alerts/notifications/" + data.notification, { credentials: "include", cache: "no-store" });
      if (!response.ok) return;
      const note = (await response.json()).data;
      if (!note?.active || note.snoozed || revision !== stockSessionRevision) return;
      await self.registration.showNotification(note.title, { body: note.body, icon: "/pwa/icon-192.png", tag: "dg-stock-" + note.incident, data: { kind: "stock-alert", item: note.item }, renotify: true });
    } catch { /* Offline: do not display stale or cross-account stock details. */ }
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const item = event.notification.data?.item;
  const destination = event.notification.data?.kind === "stock-alert" ? "/inventory/low-stock-alerts?tab=current" + (/^[a-f0-9]{24}$/i.test(item || "") ? "&item=" + item : "") : "/kitchen";
  event.waitUntil(self.clients.openWindow(destination));
});
`;
export default workerSource;
