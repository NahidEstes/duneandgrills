// Served with a deployment/build-specific cache version. No financial offline queue.
const workerSource = `/* This worker deliberately has no Background Sync or financial request queue. */
const VERSION = "__DG_BUILD_VERSION__";
const PREFIX = "dg-pwa-";
const STATIC = \`\${PREFIX}\${VERSION}-static\`;
const MENU = \`\${PREFIX}\${VERSION}-menu\`;
const OFFLINE = ["/offline.html", "/pwa/offline.css", "/pwa/offline.js", "/pwa/icon-192.png", "/pwa/icon-512.png", "/pwa/maskable-512.png", "/pwa/apple-180.png"];
const MAX_AGE = 24 * 60 * 60 * 1000;
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
self.addEventListener("message", event => { if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting()); });
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

self.addEventListener("notificationclick", event => { event.notification.close(); event.waitUntil(self.clients.openWindow("/kitchen")); });
`;
export default workerSource;
