import test from "node:test";
import assert from "node:assert/strict";
import { riderCount, riderDeliveryStage, riderInitials, filterDeliveries, ACTIVE_RIDER_FILTERS } from "../src/components/rider/riderPresentation.js";
import { staffRoles } from "../src/security/policy.js";

test("dashboard totals use all-page server counts, never visible records or invented zeroes", () => {
  const data = { mode: "operational", counts: { active: 27, deliveredToday: 12, issue: 3 }, deliveries: [{ deliveryStatus: "assigned" }] };
  assert.equal(riderCount(data, "active"), 27);
  assert.equal(riderCount(data, "deliveredToday"), 12);
  assert.equal(riderCount(data, "issue"), 3);
  assert.equal(riderCount({ mode: "disabled", deliveries: [] }, "active"), "—");
  assert.equal(riderCount({ mode: "operational", counts: { active: 0 } }, "active"), 0);
  assert.equal(riderCount({ mode: "operational", counts: { active: -1 }, deliveries: [1] }, "active"), "—");
});

test("assigned non-ready orders stay in Awaiting pickup; issue and transit states stay distinct", () => {
  const rows = [
    { deliveryStatus: "assigned", restaurantStatus: "ready" },
    { deliveryStatus: "assigned", restaurantStatus: "preparing" },
    { deliveryStatus: "picked_up", restaurantStatus: "out-for-delivery" },
    { deliveryStatus: "issue", restaurantStatus: "ready", issue: { previousStatus: "assigned" } },
  ];
  assert.equal(filterDeliveries(rows, "assigned").length, 2);
  assert.deepEqual(rows.map(row => riderDeliveryStage(row).label), ["Ready for pickup", "Preparing", "On the way", "Delivery issue"]);
  assert.equal(riderDeliveryStage({ deliveryStatus: "assigned", restaurantStatus: "ready", canOperate: false }).label, "Requires review");
  assert.equal(riderDeliveryStage({ deliveryStatus: "delivered", restaurantStatus: "delivered" }).label, "Completed");
  assert.deepEqual(ACTIVE_RIDER_FILTERS.map(filter => filter.value), ["all", "assigned", "picked_up"]);
});

test("new list/cash routes and delivery details keep existing staff access restrictions", () => {
  for (const path of ["/rider", "/rider/deliveries", "/rider/history", "/rider/cash", "/rider/profile", "/rider/deliveries/private-id"]) {
    assert.deepEqual(staffRoles(path), ["admin", "rider"]);
    assert.ok(!staffRoles(path).includes("customer"));
  }
  assert.equal(riderInitials("Nadia Rahman"), "NR");
  assert.equal(riderInitials("  রাইডার  আলী "), "রআ");
});
