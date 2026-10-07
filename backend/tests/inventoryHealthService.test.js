import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateInventoryHealth } from "../services/inventoryHealthService.js";
import { calculateSaleableInventory } from "../services/inventoryEligibilityService.js";

const now = new Date("2026-10-07T12:00:00Z");
const item = (id, changes = {}) => ({ _id: id, currentStock: 10, reorderLevel: 3, tracksExpiry: true, unit: "kg", isActive: true, ...changes });
const batch = (id, quantity, expiryDate = "2026-10-09T00:00:00+03:00", qualityStatus = "usable") => ({ item: id, remainingQuantity: quantity, expiryDate, qualityStatus });
const health = (items, batches, options = {}) => calculateInventoryHealth(items, batches, { now, expiryAlertDays: 3, ...options });

test("positive physical stock with only expired/blocked/missing-expiry batches is out, never low", () => {
  const result = health([item("a")], [batch("a", 4, "2026-10-06", "usable"), batch("a", 2, null), batch("a", 2, null, "quarantined"), batch("a", 2, null, "damaged")]);
  assert.equal(result.rows[0].physicalStock, 10); assert.equal(result.rows[0].saleableStock, 0);
  assert.equal(result.summary.outOfStock, 1); assert.equal(result.summary.lowStock, 0);
  assert.equal(result.summary.blockedItems, 1);
  for (const key of ["expiredItems", "quarantinedItems", "damagedItems", "unknownExpiryItems"]) assert.equal(result.summary[key], 1);
});

test("only eligible quantities count; reorder boundary inclusive, low/out mutually exclusive", () => {
  const result = health([item("low"), item("above"), item("out", { currentStock: 0 }), item("zero-level", { currentStock: 1, reorderLevel: 0 })], [batch("low", 3), batch("low", 7, "2026-10-06"), batch("above", 4), batch("above", 6, null, "damaged"), batch("zero-level", 1)]);
  assert.deepEqual(result.rows.map(row => row.saleableStock), [3, 4, 0, 1]);
  assert.equal(result.summary.lowStock, 1); assert.equal(result.summary.outOfStock, 1);
  assert.ok(result.rows.every(row => !(row.stockHealth.low && row.stockHealth.out)));
});

test("multiple affected batches deduplicate items; quantities in kg and pcs are never combined", () => {
  const result = health([item("a"), item("b", { unit: "pcs" })], [batch("a", 3, "2026-10-05"), batch("a", 7, "2026-10-06"), batch("b", 10, null, "damaged")]);
  assert.equal(result.summary.expiredItems, 1); assert.equal(result.summary.blockedItems, 2);
  assert.equal(result.summary.metricUnit, "unique active inventory items");
  assert.equal(result.summary.physicalStock, undefined); assert.equal(result.summary.saleableStock, undefined);
});

test("today, tomorrow and full alert-window end day included, expired/outside/depleted/inactive excluded", () => {
  const items = ["expired", "today", "tomorrow", "boundary", "outside", "depleted", "inactive"].map(id => item(id, id === "inactive" ? { isActive: false } : {}));
  const batches = [batch("expired", 10, "2026-10-06T23:59:59+03:00"), batch("today", 10, "2026-10-07T00:00:00+03:00"), batch("tomorrow", 10, "2026-10-08"), batch("boundary", 10, "2026-10-10T23:59:59+03:00"), batch("outside", 10, "2026-10-11T00:00:00+03:00"), batch("depleted", 0, "2026-10-07"), batch("inactive", 10, "2026-10-07")];
  const result = health(items, batches);
  assert.equal(result.summary.expiringItems, 3); assert.equal(result.summary.expiredItems, 1);
  assert.equal(result.rows[1].saleableStock, 10); assert.equal(result.rows[5].stockHealth.expiring, false);
  assert.equal(result.rows[5].saleableStock, 0); assert.equal(result.rows[5].stockHealth.unallocated, true);
});

test("expiry changes only at Riyadh midnight, not UTC midnight", () => {
  const items = [item("a")], batches = [batch("a", 10, "2026-10-07T00:00:00+03:00")];
  assert.equal(health(items, batches, { now: new Date("2026-10-07T20:59:59.999Z") }).rows[0].saleableStock, 10);
  const after = health(items, batches, { now: new Date("2026-10-07T21:00:00Z") });
  assert.equal(after.rows[0].saleableStock, 0); assert.equal(after.summary.expiredItems, 1); assert.equal(after.summary.expiringItems, 0);
});

test("genuine legacy stock only; no tracked unknown-expiry fallback or fallback from depleted history", () => {
  const items = [item("unknown"), item("dated", { expiryDate: "2026-10-07" }), item("untracked", { tracksExpiry: false }), item("expired", { expiryDate: "2026-10-06" }), item("history", { expiryDate: "2026-10-09" })];
  const result = health(items, [batch("history", 0)]);
  assert.deepEqual(result.rows.map(row => row.saleableStock), [0, 10, 10, 0, 0]);
  assert.equal(result.summary.unknownExpiryItems, 1); assert.equal(result.summary.unallocatedItems, 1);
  assert.equal(result.rows[4].legacyStockFallback, false);
});

test("physical ceiling, fractional quantities and original fields preserved", () => {
  const original = item("a", { currentStock: 0.3 });
  const result = health([original], [batch("a", 0.1), batch("a", 0.2)]);
  assert.equal(result.rows[0].saleableStock, 0.3); assert.equal(result.rows[0].currentStock, 0.3);
  assert.deepEqual(original, item("a", { currentStock: 0.3 }));
  assert.equal(calculateSaleableInventory(original, [batch("a", 9)], now).saleableStock, 0.3);
});

test("expiring warnings describe physical remaining batches even when quarantined", () => {
  const result = health([item("a")], [batch("a", 10, "2026-10-07", "quarantined")]);
  assert.equal(result.summary.expiringItems, 1); assert.equal(result.summary.quarantinedItems, 1);
  assert.equal(result.summary.outOfStock, 1);
});

test("missing historical quality field remains usable; null/unclassified quality is not silently eligible", () => {
  const historical = batch("a", 5); delete historical.qualityStatus;
  const result = health([item("a")], [historical, batch("a", 5, "2026-10-09", null)]);
  assert.equal(result.rows[0].saleableStock, 5); assert.equal(result.summary.unknownQualityItems, 1);
});
