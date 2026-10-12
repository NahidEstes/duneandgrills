import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url), { transformSync } = require("next/dist/build/swc");
let responses = {}, calls = [];
const api = { get: async (path, options) => { calls.push({ path, options }); const data = responses[path]; if (data instanceof Error) throw data; return { data }; },
  patch: async (path, body) => { calls.push({ path, body }); return { data: { success: true, data: { enabled: body.enabled, revision: body.expectedRevision + 1 } } }; } };
const load = file => {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const code = transformSync(source, { filename: file, jsc: { parser: { syntax: "ecmascript" } }, module: { type: "commonjs" } }).code;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", code)(() => ({ __esModule: true, default: api }), compiledModule, compiledModule.exports);
  return compiledModule.exports;
};
const rider = load("../src/api/riderApi.js"), delivery = load("../src/api/deliveryApi.js");
const operational = { success: true, mode: "operational", operationalEnabled: true, profile: { id: "rider-a" }, deliveries: [{ id: "delivery-a", riderId: "rider-a" }], counts: { active: 1 } };

test("normal rider uses private live portal with bounded server filters and abort signal", async () => {
  responses = { "/rider/portal": operational }; calls = [];
  const signal = new AbortController().signal;
  assert.deepEqual(await rider.fetchRiderPortal(false, signal, { status: "assigned", history: true, page: 2 }), operational);
  assert.deepEqual(calls[0], { path: "/rider/portal", options: { signal, params: { status: "assigned", history: "true", limit: 20, page: 2 } } });
});
test("preview never accepts operational data, other riders or synthetic live lists", async () => {
  responses = { "/rider/preview": operational }; await assert.rejects(rider.fetchRiderPortal(true), /Unexpected/);
  responses = { "/rider/portal": { ...operational, deliveries: [{ riderId: "rider-b" }] } }; await assert.rejects(rider.fetchRiderPortal(false), /Unexpected/);
  responses["/rider/portal"] = { ...operational, deliveries: [{ riderId: "rider-a", synthetic: true }] }; await assert.rejects(rider.fetchRiderPortal(false), /Unexpected/);
  responses["/rider/portal"] = { ...operational, operationalEnabled: false }; await assert.rejects(rider.fetchRiderPortal(false), /Unexpected/);
});
test("normal management requires saved enablement; failure is not a fabricated disabled result", async () => {
  responses = { "/deliveries/config": { success: true, operationalEnabled: false, workflowEnabled: true } }; calls = [];
  assert.equal((await delivery.fetchDeliveryManagement({})).mode, "disabled"); assert.equal(calls.length, 1);
  responses["/deliveries/config"] = { success: false }; await assert.rejects(delivery.fetchDeliveryManagement({}), /unavailable/);
  responses = { "/deliveries/config": { success: true, operationalEnabled: true, workflowEnabled: false }, "/deliveries": operational, "/deliveries/riders": { data: [{ id: "rider-a" }] } };
  const result = await delivery.fetchDeliveryManagement({}); assert.equal(result.mode, "operational"); assert.equal(result.riders[0].id, "rider-a");
});
test("normal detail works without rehearsal URL, and preview rejects live detail envelopes", async () => {
  responses = { "/rider/workflow/deliveries/delivery-a": operational, "/rider/preview/deliveries/delivery-a": operational };
  assert.equal((await delivery.fetchDeliveryDetails("delivery-a", {})).mode, "operational");
  await assert.rejects(delivery.fetchDeliveryDetails("delivery-a", { preview: true }), /Unexpected/);
});
test("rider toggle uses separate revisioned settings API; general form cannot silently overwrite it", async () => {
  calls = []; assert.deepEqual(await delivery.saveRiderDeliverySetting({ enabled: true, expectedRevision: 2 }), { enabled: true, revision: 3 });
  assert.deepEqual(calls[0], { path: "/settings/rider-delivery", body: { enabled: true, expectedRevision: 2 } });
  const settings = readFileSync(new URL("../src/components/admin/settings/RiderDeliverySettings.jsx", import.meta.url), "utf8");
  assert.match(settings, /user\?\.role !== "admin"/); assert.match(settings, /type="button"/); assert.match(settings, /role="alert"/);
  const form = readFileSync(new URL("../src/components/admin/settings/RestaurantSettingsPage.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(form.split("const snapshot")[0], /riderDelivery:/);
});
