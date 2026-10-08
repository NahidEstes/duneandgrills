import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url), { transformSync } = require("next/dist/build/swc");
const path = new URL("../src/api/api.js", import.meta.url);
const transformed = transformSync(readFileSync(path, "utf8"), { filename: path.pathname, jsc: { parser: { syntax: "ecmascript" } }, module: { type: "commonjs" } });
let response, lastRequest;
const api = { get: async (resource, options) => { lastRequest = { resource, options }; return { data: response }; }, interceptors: { request: { use() {} } } };
const compiledModule = { exports: {} };
const localRequire = id => id === "axios" ? { create: () => api } : id.includes("selectionOptions") ? {} : id.startsWith("@/") ? {} : require(id);
new Function("require", "module", "exports", transformed.code)(localRequire, compiledModule, compiledModule.exports);
const { fetchAdminDashboard, fetchOrders, fetchRestaurantSettings } = compiledModule.exports;

test("dashboard API preserves cancellation/timeouts and rejects unavailable envelopes instead of zero success", async () => {
  const signal = new AbortController().signal; response = { success: true, data: { stats: { totalOrders: 0 } } };
  assert.deepEqual(await fetchAdminDashboard({ signal }), response.data);
  assert.equal(lastRequest.options.signal, signal); assert.equal(lastRequest.options.timeout, 20_000);
  for (const data of [undefined, null, [], "wrong"]) { response = { success: true, data }; await assert.rejects(fetchAdminDashboard(), /unavailable/); }
  response = { success: false, data: {} }; await assert.rejects(fetchAdminDashboard(), /unavailable/);
});

test("pending API distinguishes genuine empty results from malformed/failure responses without losing filters", async () => {
  const signal = new AbortController().signal; response = { success: true, data: [] };
  assert.deepEqual(await fetchOrders("pending", { signal, timeout: 20_000 }), []);
  assert.deepEqual(lastRequest.options.params, { status: "pending" }); assert.equal(lastRequest.options.signal, signal);
  for (const body of [{ success: false, data: [] }, { success: true }, { success: true, data: {} }, { success: true, data: [null] }, { success: true, data: [{}] }]) {
    response = body; await assert.rejects(fetchOrders("pending"), /unavailable/);
  }
});

test("settings API never silently treats malformed data as a successful settings refresh", async () => {
  response = { success: true, data: { notifications: {} } }; assert.deepEqual(await fetchRestaurantSettings(), response.data);
  response = { success: true, data: [] }; await assert.rejects(fetchRestaurantSettings(), /unavailable/);
});
