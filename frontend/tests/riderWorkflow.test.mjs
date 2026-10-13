import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { staffRoles } from "../src/security/policy.js";
import { createDeliverySubmission, customerPhoneHref, customerMapHref, deliveryModeQuery, deliveryStatusLabel } from "../src/components/rider/deliveryPresentation.js";

test("delivery deep links and restricted management roles", () => {
  assert.deepEqual(staffRoles("/admin/deliveries"), ["admin", "manager", "cashier"]);
  assert.ok(!staffRoles("/admin/expenses").includes("rider"));
  assert.equal(deliveryModeQuery({ rehearsal: true }), "?rehearsal=1");
  assert.equal(deliveryModeQuery({ preview: true, rehearsal: true }), "?preview=1");
  assert.equal(deliveryStatusLabel("picked_up"), "Picked Up");
});
test("contact actions do not accept arbitrary URI protocols", () => {
  assert.equal(customerPhoneHref("+966 500-000-000"), "tel:+966500000000");
  assert.equal(customerPhoneHref("javascript:alert(1)"), null);
  assert.equal(customerPhoneHref(""), null);
  assert.equal(customerMapHref("  Sample & District  "), "https://www.google.com/maps/search/?api=1&query=Sample%20%26%20District");
  assert.equal(customerMapHref(" "), null);
});
test("offline action is not sent, queued or automatically replayed", async () => {
  const submit = createDeliverySubmission(); let calls = 0;
  await assert.rejects(submit("pickup", { expectedRevision: 0 }, () => { calls++; }, false), /No delivery action has been queued/);
  assert.equal(calls, 0);
});
test("uncertain retries keep their identifier; only confirmed server success releases it", async () => {
  const submit = createDeliverySubmission(); const keys = [];
  const fail = payload => { keys.push(payload.idempotencyKey); throw new Error("timeout"); };
  const success = async payload => { keys.push(payload.idempotencyKey); return { success: true, duplicate: true }; };
  await assert.rejects(submit("pickup", { expectedRevision: 0 }, fail), /timeout/);
  await submit("pickup", { expectedRevision: 0 }, success);
  assert.equal(keys[0], keys[1]);
  await submit("pickup", { expectedRevision: 0 }, success);
  assert.notEqual(keys[1], keys[2]);
});
test("double-click is bounded and success is not returned before confirmation", async () => {
  const submit = createDeliverySubmission(); let resolve, calls = 0;
  const first = submit("deliver", { expectedRevision: 1 }, () => { calls++; return new Promise(done => { resolve = done; }); });
  await assert.rejects(submit("deliver", { expectedRevision: 1 }, () => { calls++; }), /already running/);
  assert.equal(calls, 1); resolve({ success: true }); await first;
  await assert.rejects(submit("deliver", { expectedRevision: 2 }, async () => ({ success: false })), /not confirmed/);
});
test("lists use server pagination/counts; mode changes abort reads and mutations ignore unmount", async () => {
  const read = path => readFile(new URL(path, import.meta.url), "utf8");
  const portal = await read("../src/components/rider/RiderPortal.jsx");
  assert.match(portal, /data\.counts\.active/); assert.match(portal, /data\.pagination\.total/);
  assert.match(portal, /rehearsal: props\.rehearsal && !props\.preview/);
  const hook = await read("../src/components/rider/riderReadState.js");
  assert.match(hook, /controller\?\.abort\(\)/); assert.match(hook, /token !== sequence/);
  const write = await read("../src/hooks/useDeliverySubmission.js");
  assert.match(write, /mounted\.current = false/); assert.match(write, /if \(busy\.current\) return null/);
});
