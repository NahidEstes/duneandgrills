import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { staffRoles } from "../src/security/policy.js";
import { filterDeliveries, paymentLabel, RIDER_FILTERS } from "../src/components/rider/riderPresentation.js";

test("all rider routes require admin/rider, unrelated private workspaces exclude rider", () => {
  for (const route of ["/rider", "/rider/history", "/rider/profile"]) assert.deepEqual(staffRoles(route), ["admin", "rider"]);
  for (const route of ["/admin", "/admin/expenses", "/pos", "/kitchen"]) assert.ok(!staffRoles(route).includes("rider"));
});
test("preview filters and honest payment labels", () => {
  const rows = [{ deliveryStatus: "assigned" }, { deliveryStatus: "picked_up" }];
  assert.equal(filterDeliveries(rows, "all").length, 2);
  assert.equal(filterDeliveries(rows, "assigned").length, 1);
  assert.deepEqual(RIDER_FILTERS.map(row => row.value), ["all", "assigned", "picked_up"]);
  assert.equal(paymentLabel("pending"), "Payment not confirmed");
  assert.equal(paymentLabel(undefined), "Payment unavailable");
});
test("rider API is read-only and rejects unexpected operational/other-rider data", async () => {
  const source = await readFile(new URL("../src/api/riderApi.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /api\.(post|put|patch|delete)\(/);
  assert.match(source, /data\.operationalEnabled !== false/);
  assert.match(source, /row\.riderId !== data\.profile\.id/);
});
test("rider provider avoids favorites, customer cart hydration and reward-writing me endpoint", async () => {
  const auth = await readFile(new URL("../src/context/AuthContext.jsx", import.meta.url), "utf8");
  const providers = await readFile(new URL("../app/providers.jsx", import.meta.url), "utf8");
  assert.match(auth, /readOnlyStaff \? await fetchSession\(\)/);
  assert.match(auth, /if \(!readOnlyStaff && currentUser\.role !== "rider"\) await restoreUserCart/);
  assert.match(providers, /<AuthProvider readOnlyStaff>/);
});
