import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createManifest, appKind } from "../src/pwa/config.js";
import workerSource from "../src/pwa/workerSource.js";
import { contentSecurityPolicy, staffRoles } from "../src/security/policy.js";
import { beginWrite, endWrite, updateBlocked, updateBlockedForWindow, serverClockOffset } from "../src/pwa/network.js";
import { siteOrigin } from "../src/config/site.js";
import { submitPersisted } from "../src/utils/persistedSubmission.js";

function worker() {
  const handlers = new Map(); const buckets = new Map(); let now = Date.now(); let activations = 0; let transport = async () => new Response("network");
  const key = value => typeof value === "string" ? new URL(value, "https://owned.test").href : value.url;
  const open = async name => {
    if (!buckets.has(name)) buckets.set(name, new Map());
    const entries = buckets.get(name);
    return { addAll: async paths => { for (const value of paths) entries.set(key(value), { request: new Request(key(value)), response: new Response(value === "/offline.html" ? "Offline page" : "static") }); },
      put: async (request, response) => entries.set(key(request), { request, response: response.clone() }),
      keys: async () => [...entries.values()].map(value => value.request), delete: async request => entries.delete(key(request)) };
  };
  const cache = { open, keys: async () => [...buckets.keys()], delete: async name => buckets.delete(name), match: async (request, options = {}) => {
    for (const [name, entries] of buckets) if (!options.cacheName || name === options.cacheName) { const found = entries.get(key(request)); if (found) return found.response.clone(); }
  } };
  const context = { Request, Response, URL, Headers, Date: { now: () => now }, caches: cache, fetch: request => transport(request),
    self: { location: { origin: "https://owned.test" }, clients: { matchAll: async () => [], claim: async () => {} }, skipWaiting: async () => { activations++; }, addEventListener: (name, fn) => handlers.set(name, fn) } };
  vm.runInNewContext(workerSource, context);
  return { handlers, buckets, open, activations: () => activations, transport: value => { transport = value; }, advance: amount => { now += amount; },
    lifecycle: async name => { let pending; handlers.get(name)({ waitUntil: task => { pending = task; } }); await pending; },
    request: async (path, options = {}) => { let response; const request = new Request(`https://owned.test${path}`, options); handlers.get("fetch")({ request, respondWith: value => { response = value; } }); return response ? await response : undefined; },
  };
}
test("three real manifests have distinct IDs and in-scope path-based launch URLs", () => {
  const ids = new Set();
  for (const kind of ["customer", "pos", "kitchen"]) { const value = createManifest(kind); ids.add(value.id); assert.ok(value.start_url.startsWith(value.scope)); assert.equal(value.display, "standalone"); assert.deepEqual(value.icons.map(icon => icon.sizes), ["192x192", "512x512", "512x512"]); }
  assert.equal(ids.size, 3); assert.equal(appKind("/pos/customer-display"), "pos"); assert.equal(appKind("/kitchen/recipes"), "kitchen"); assert.equal(appKind("/position"), "customer");
});
test("private reads and every mutation bypass the worker", async () => {
  const sw = worker();
  for (const path of ["/api/auth/me", "/api/orders", "/api/kitchen/orders", "/api/rewards/me", "/api/menu/manage", "/api/menu?search=private", "/api/orders/track/123"]) assert.equal(await sw.request(path), undefined);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(await sw.request("/api/orders", { method }), undefined);
});
test("public catalog falls back with an explicit stale marker and expires after 24 hours", async () => {
  const sw = worker(); sw.transport(async () => new Response(JSON.stringify({ success: true, data: [{ name: "Menu" }] }), { headers: { "X-DG-Public-Catalog": "1", "Content-Type": "application/json" } }));
  assert.equal((await sw.request("/api/menu", { headers: { Authorization: "Bearer secret" } })).status, 200);
  const saved = [...sw.buckets.values()].flatMap(entries => [...entries.values()]); assert.ok(saved.every(entry => !entry.request.headers.has("authorization")));
  sw.transport(async () => { throw new Error("offline"); }); const stale = await sw.request("/api/menu"); assert.equal(stale.headers.get("X-DG-Stale"), "1"); assert.equal((await stale.json()).data[0].name, "Menu");
  sw.advance(24 * 60 * 60 * 1000 + 1); assert.equal((await sw.request("/api/menu")).status, 503);
});
test("private/unmarked catalog responses are never retained", async () => {
  const sw = worker(); sw.transport(async () => new Response("private")); await sw.request("/api/menu");
  sw.transport(async () => { throw new Error("offline"); }); assert.equal((await sw.request("/api/menu")).status, 503);
});
test("cache activation deletes only old app caches and waits for explicit update activation", async () => {
  const sw = worker(); await sw.open("unrelated-cache"); await sw.open("dg-pwa-old-static"); await sw.lifecycle("install"); await sw.lifecycle("activate");
  assert.ok(sw.buckets.has("unrelated-cache")); assert.equal(sw.buckets.has("dg-pwa-old-static"), false); assert.equal(sw.handlers.has("sync"), false);
  assert.equal(sw.activations(), 0);
  sw.handlers.get("message")({ data: { type: "UNRELATED" } }); assert.equal(sw.activations(), 0);
  let activation; sw.handlers.get("message")({ data: { type: "ACTIVATE_UPDATE" }, waitUntil: task => { activation = task; } }); await activation; assert.equal(sw.activations(), 1);
});
test("deployments choose their own metadata origin; strict CSP restricts script execution", () => {
  assert.equal(siteOrigin({ VERCEL_URL: "owned-staging.vercel.app" }), "https://owned-staging.vercel.app"); assert.equal(siteOrigin({ SITE_URL: "https://restaurant.test/" }), "https://restaurant.test");
  const policy = contentSecurityPolicy("unique", false); assert.match(policy, /script-src 'self' 'nonce-unique' 'strict-dynamic'/); assert.ok(!policy.includes("unsafe-eval")); assert.match(policy, /frame-ancestors 'none'/); assert.match(policy, /worker-src 'self'/);
  assert.deepEqual(staffRoles("/admin/expenses"), ["admin", "manager", "accountant"]); assert.equal(staffRoles("/pos/customer-display"), null); assert.equal(staffRoles("/kitchen/manifest.webmanifest"), null); assert.equal(staffRoles("/admin").includes("cashier"), false);
  assert.equal(staffRoles("/admin/staff/manifest.webmanifest").includes("customer"), false);
});
test("updates are blocked by active or unresolved financial writes", () => {
  const empty = { length: 0 }; assert.equal(updateBlocked([empty]), false); beginWrite(); assert.equal(updateBlocked([empty]), true); endWrite();
  assert.equal(updateBlocked([{ length: 1, key: () => "dg-submission:pos-sale:cashier:MAIN" }]), true); assert.equal(updateBlocked([{ get length() { throw new Error("denied"); } }]), true);
  assert.equal(updateBlockedForWindow({ get localStorage() { throw new Error("denied"); } }), true);
});
test("clock offset handles latency and invalid timestamps without NaN timers", () => { assert.equal(serverClockOffset("2026-10-10T00:00:01.000Z", 1791590400000, 1791590400200), 900); assert.equal(serverClockOffset(undefined, 0, 10), 0); });
test("offline financial capture does not persist or send a new operation", async () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "navigator"); Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: false } }); let saved = false; let sent = false;
  try { await assert.rejects(submitPersisted({ storage: { setItem: () => { saved = true; } }, key: "x", payload: {}, send: () => { sent = true; } }), /no new request has been queued/); assert.equal(saved, false); assert.equal(sent, false); }
  finally { Object.defineProperty(globalThis, "navigator", old); }
});
