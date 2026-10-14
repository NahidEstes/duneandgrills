import test from "node:test";
import assert from "node:assert/strict";
import { managementFilterQuery, removeManagementFilter, appliedDeliveryChips, deliveryStageDuration, previewManagementRows } from "../src/components/admin/delivery/deliveryManagementView.js";
import { createDeliveryWorkspace, emptyDeliveryQuery } from "../src/components/admin/delivery/deliveryWorkspace.js";

test("workspace changes reset unrelated filters and pagination; default chips are absent", () => {
  const active = managementFilterQuery("active", { search: "ORDER", status: "issue", page: 5 });
  assert.equal(active.page, 1); assert.equal(active.datePeriod, "all");
  const cash = managementFilterQuery("cash"); assert.equal(cash.status, "all"); assert.equal(cash.attention, "all"); assert.equal(cash.search, ""); assert.equal(cash.dateBasis, "delivered");
  assert.deepEqual(appliedDeliveryChips(managementFilterQuery("active"), true), []);
  assert.deepEqual(appliedDeliveryChips(cash, false), []);
});

test("chips remove only the applied constraint, reset page and fully clear custom date bounds", () => {
  const query = { ...managementFilterQuery("history"), search: "ORDER", datePeriod: "custom", from: "2026-10-01", to: "2026-10-14", riderId: "rider", page: 3 };
  assert.deepEqual(appliedDeliveryChips(query, true, [{ id: "rider", name: "Fixture rider" }]).map(chip => chip.key), ["search", "date", "riderId"]);
  const removed = removeManagementFilter(query, "search"); assert.equal(removed.search, ""); assert.equal(removed.riderId, "rider"); assert.equal(removed.page, 1);
  const dates = removeManagementFilter(query, "date"); assert.equal(dates.from, ""); assert.equal(dates.to, ""); assert.equal(dates.datePeriod, "all"); assert.equal(dates.dateBasis, "delivered");
  assert.equal(appliedDeliveryChips(query, false).some(chip => chip.key === "riderId"), false);
});

test("durations use the recorded stage clock at the server snapshot, not generic updatedAt", () => {
  const now = "2026-10-14T10:10:00Z", row = { deliveryStatus: "assigned", restaurantStatus: "ready", assignedAt: "2026-10-14T09:00:00Z", pickupClock: "2026-10-14T10:00:00Z", updatedAt: now };
  assert.equal(deliveryStageDuration(row, now), "Pickup wait · 10 min");
  assert.equal(deliveryStageDuration({ ...row, pickupClock: null }, now), "Timing unavailable");
  assert.equal(deliveryStageDuration({ ...row, restaurantStatus: "preparing" }, now), "Assigned · 1h 10m");
  assert.equal(deliveryStageDuration({ deliveryStatus: "picked_up", pickedUpAt: "2026-10-13T09:00:00Z" }, now), "In transit · 1d 1h");
  assert.equal(deliveryStageDuration({ deliveryStatus: "issue", issue: { reportedAt: "2026-10-14T10:09:30Z" } }, now), "Issue open · < 1 min");
  for (const time of [null, "bad", "2026-10-15T10:00:00Z"]) assert.equal(deliveryStageDuration({ deliveryStatus: "picked_up", pickedUpAt: time }, now), "Timing unavailable");
});

test("role-specific initial queries are explicit and changing drafts never reads", async () => {
  const calls = [], workspace = createDeliveryWorkspace({ initialQuery: emptyDeliveryQuery("cash"), list: async query => { calls.push(query); return { deliveries: [] }; }, detail: async () => ({}) });
  const draft = { ...workspace.snapshot().query, search: "draft" }; assert.equal(calls.length, 0);
  await workspace.load(); assert.equal(calls[0].workspace, "cash"); assert.equal(calls[0].search, "");
  await workspace.load(draft); assert.equal(calls[1].search, "draft"); workspace.dispose();
});

test("synthetic preview respects workspaces and never exposes completed examples as active", () => {
  const rows = [{ deliveryStatus: "issue", orderNumber: "A" }, { deliveryStatus: "unassigned", orderNumber: "B" }, { deliveryStatus: "delivered", orderNumber: "C" }];
  assert.deepEqual(previewManagementRows(rows, managementFilterQuery("active")).map(row => row.orderNumber), ["A", "B"]);
  assert.deepEqual(previewManagementRows(rows, managementFilterQuery("history")).map(row => row.orderNumber), ["C"]);
});
