import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { assignmentConfirmation, canAssignDelivery, confirmationStillCurrent, deliveryActionLabel, deliveryDateLabel, orderPaymentLabel } from "../src/components/admin/delivery/deliveryManagementPresentation.js";
import { emptyDeliveryQuery, createDeliveryWorkspace } from "../src/components/admin/delivery/deliveryWorkspace.js";

test("contextual actions never offer assignment for blocked, picked-up or historical orders", () => {
  assert.equal(deliveryActionLabel({ deliveryStatus: "unassigned", canOperate: false }, true), "Review Required");
  assert.equal(deliveryActionLabel({ deliveryStatus: "unassigned" }, true), "Assign");
  assert.equal(deliveryActionLabel({ deliveryStatus: "assigned" }, true), "Reassign");
  assert.equal(deliveryActionLabel({ deliveryStatus: "assigned" }, false), "View Details");
  assert.equal(deliveryActionLabel({ deliveryStatus: "issue" }, true), "Review Issue");
  assert.equal(deliveryActionLabel({ deliveryStatus: "delivered", cashState: "discrepancy" }, false), "Review Cash");
  assert.equal(deliveryActionLabel({ deliveryStatus: "picked_up" }, true), "View Details");
  assert.equal(deliveryActionLabel({ deliveryStatus: "delivered", cashState: "confirmed" }, true), "View Details");
});

test("confirmation snapshots require an available different rider, reassignment reason and unchanged revisions", () => {
  const row = { id: "A", orderNumber: "TEST-A", revision: 1, orderRevision: 4, deliveryStatus: "assigned", riderId: "B", canOperate: true };
  const rider = { id: "C", name: "Dummy rider", available: true };
  assert.equal(canAssignDelivery(row, { ...rider, id: "B" }, "reason"), false);
  assert.equal(canAssignDelivery(row, rider, "   "), false); assert.equal(canAssignDelivery(row, { ...rider, available: false }, "reason"), false);
  assert.equal(canAssignDelivery({ ...row, canOperate: false }, rider, "reason"), false);
  for (const deliveryStatus of ["issue", "picked_up", "delivered"]) assert.equal(canAssignDelivery({ ...row, deliveryStatus }, rider, "reason"), false);
  const confirmed = assignmentConfirmation(row, rider, " reason ");
  assert.equal(confirmed.reason, "reason"); assert.equal(confirmed.riderName, rider.name); assert.equal(confirmed.orderNumber, row.orderNumber);
  assert.equal(confirmationStillCurrent(confirmed, row, rider, "reason"), true);
  for (const changed of [{ ...row, id: "D" }, { ...row, revision: 2 }, { ...row, orderRevision: 5 }, { ...row, deliveryStatus: "picked_up" }]) assert.equal(Boolean(confirmationStillCurrent(confirmed, changed, rider, "reason")), false);
  assert.equal(confirmationStillCurrent(confirmed, row, rider, "different reason"), false);
});

test("Riyadh date labels and shared payment labels are honest and separate", () => {
  assert.match(deliveryDateLabel("2026-12-31T21:00:00Z"), /01\/01\/2027.*00:00:00.*Riyadh/);
  assert.equal(deliveryDateLabel(null), "Timestamp unavailable"); assert.equal(deliveryDateLabel("bad"), "Timestamp unavailable");
  assert.equal(orderPaymentLabel({ paymentStatus: "pending" }), "Payment pending");
  assert.equal(orderPaymentLabel({ paymentStatus: "paid" }), "Paid");
});

test("date/rider/sort draft changes do not fetch; only latest explicitly applied query survives", async () => {
  const reads = [];
  const workspace = createDeliveryWorkspace({ list: query => new Promise(resolve => reads.push({ query, resolve })), detail: async () => ({}) });
  const draft = { ...emptyDeliveryQuery(), datePeriod: "custom", from: "2026-01-01", to: "2026-01-02", riderId: "C", sort: "assigned_longest" };
  assert.equal(reads.length, 0);
  const first = workspace.load(draft), second = workspace.load({ ...draft, dateBasis: "delivered", page: 2 });
  reads[1].resolve({ mode: "operational", deliveries: [] }); await second;
  reads[0].resolve({ mode: "operational", deliveries: [{ id: "old" }] }); await first;
  assert.equal(workspace.snapshot().dataQuery.dateBasis, "delivered"); assert.equal(workspace.snapshot().query.page, 2);
  const refresh = workspace.load(); assert.equal(reads[2].query.dateBasis, "delivered"); reads[2].resolve({ deliveries: [] }); await refresh;
  workspace.dispose();
});

test("modular UI preserves details identity and uses real modal focus containment", () => {
  const read = name => readFileSync(new URL(`../src/components/admin/delivery/${name}`, import.meta.url), "utf8");
  const dialog = read("DeliveryDialog.jsx"), ui = read("DeliveryManagement.jsx"), rows = read("DeliveryRows.jsx");
  assert.match(dialog, /node.showModal\(\)/); assert.match(dialog, /previous.focus\(\)/); assert.match(dialog, /onCancel=/); assert.match(dialog, /aria-labelledby=/);
  assert.doesNotMatch(dialog, /if \(!open\) return null/);
  assert.match(ui, /ManagementDeliveryDetails key=\{selected.id\}/); assert.match(ui, /confirmationStillCurrent/);
  assert.match(rows, /hidden overflow-x-auto lg:block/); assert.match(rows, /Delivery cards/); assert.match(rows, /lg:hidden/);
});
