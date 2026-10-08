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
const { fetchAdminDashboard, fetchAdminOperations, fetchOrders, fetchOrdersPage, fetchOrderById, fetchRestaurantSettings } = compiledModule.exports;

test("operations API supports cancellation and partial failures without confusing unavailable with zero", async () => {
  const signal = new AbortController().signal;
  response = { success: true, data: { generatedAt: "2028-01-01", categories: { invoice_review: { status: "unavailable" } }, shifts: { status: "restricted" } } };
  assert.deepEqual(await fetchAdminOperations({ signal }), response.data);
  assert.equal(lastRequest.resource, "/admin/operations-overview"); assert.equal(lastRequest.options.signal, signal); assert.equal(lastRequest.options.timeout, 20_000);
  for (const body of [{ success: false }, { success: true, data: {} }, { success: true, data: null }]) { response = body; await assert.rejects(fetchAdminOperations(), /unavailable/); }
});

test("dashboard API preserves cancellation/timeouts and rejects unavailable envelopes instead of zero success", async () => {
  const signal = new AbortController().signal; response = { success: true, data: { stats: { totalOrders: 0 }, reportingPeriod: { period: "today" } } };
  assert.deepEqual(await fetchAdminDashboard({ signal }), response.data);
  assert.equal(lastRequest.options.signal, signal); assert.equal(lastRequest.options.timeout, 20_000);
  assert.deepEqual(lastRequest.options.params, { period: "today" });
  for (const data of [undefined, null, [], "wrong"]) { response = { success: true, data }; await assert.rejects(fetchAdminDashboard(), /unavailable/); }
  response = { success: false, data: {} }; await assert.rejects(fetchAdminDashboard(), /unavailable/);
});

test("dashboard API sends selected period on each refresh and rejects mismatched responses", async () => {
  for (const period of ["today", "week", "month", "all"]) {
    response = { success: true, data: { reportingPeriod: { period } } };
    await fetchAdminDashboard({ period });
    assert.deepEqual(lastRequest.options.params, { period });
  }
  response = { success: true, data: { reportingPeriod: { period: "today" } } };
  await assert.rejects(fetchAdminDashboard({ period: "month" }), /does not match/);
  response = { success: true, data: { stats: { totalOrders: 100 } } };
  await assert.rejects(fetchAdminDashboard(), /does not match/); // Legacy All-Time envelopes must not masquerade as Today.
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

test("recent list uses server filter and bounded view with abort support; exact detail is independently fetched", async () => {
  const signal = new AbortController().signal, id = "111111111111111111111111";
  response = { success: true, data: [], pagination: { total: 0, hasMore: false } };
  assert.deepEqual(await fetchOrdersPage({ view: "recent", status: "pending" }, { signal }), { data: [], pagination: response.pagination });
  assert.deepEqual(lastRequest.options.params, { view: "recent", status: "pending" }); assert.equal(lastRequest.options.signal, signal);
  assert.equal(lastRequest.options.timeout, 20000);
  response = { success: false, data: [] }; await assert.rejects(fetchOrdersPage({ view: "recent" }), /unavailable/);
  response = { success: true, data: { _id: id } }; assert.equal((await fetchOrderById(id, { signal }))._id, id);
  assert.equal(lastRequest.resource, `/orders/${id}`); assert.equal(lastRequest.options.signal, signal);
  await assert.rejects(fetchOrderById("bad-link"), /Invalid order link/);
  response = { success: true, data: { _id: "222222222222222222222222" } }; await assert.rejects(fetchOrderById(id), /unavailable/);
});
