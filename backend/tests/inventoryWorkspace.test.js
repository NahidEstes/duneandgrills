import assert from "node:assert/strict";
import { test } from "node:test";
import { stockBreakdown } from "../services/inventoryWorkspaceService.js";
import { calculateSaleableInventory } from "../services/inventoryEligibilityService.js";
import { validateMovementPayload } from "../utils/inventoryValidation.js";
const now = new Date("2026-10-23T12:00:00Z"), future = "2030-01-01", expired = "2020-01-01";
test("stock breakdown matches eligibility and counts overlapping quality/expiry reasons once", () => {
  const item = { unit: "kg", currentStock: 100, tracksExpiry: true };
  const batches = [ { remainingQuantity: 60, expiryDate: future }, { remainingQuantity: 20, expiryDate: expired }, { remainingQuantity: 10, qualityStatus: "quarantined", expiryDate: expired }, { remainingQuantity: 10, qualityStatus: "damaged" } ];
  const result = stockBreakdown(item, batches, now);
  assert.equal(result.saleableStock, calculateSaleableInventory(item, batches, now).saleableStock);
  assert.deepEqual(result.buckets, { usable: 60, expired: 20, quarantined: 10, damaged: 10 }); assert.equal(result.reconciled, true);
});
test("missing history, depleted history, unknown quality and mismatches never invent usable stock", () => {
  const item = { unit: "kg", currentStock: 12, tracksExpiry: true };
  assert.equal(stockBreakdown(item, [], now).buckets.unknown_expiry, 12);
  const depleted = stockBreakdown(item, [{ remainingQuantity: 0 }], now); assert.equal(depleted.saleableStock, 0); assert.equal(depleted.unallocatedQuantity, 12);
  const mismatch = stockBreakdown(item, [{ remainingQuantity: 8, expiryDate: future }, { remainingQuantity: 8, expiryDate: expired }], now);
  assert.equal(mismatch.reconciled, false); assert.equal(mismatch.batchExcessQuantity, 4); assert.equal(mismatch.saleableStock, 8);
  assert.equal(stockBreakdown(item, [{ remainingQuantity: 12, qualityStatus: null, expiryDate: future }], now).buckets.unknown_quality, 12);
  assert.equal(stockBreakdown({ ...item, currentStock: -1 }, [], now).physicalStock, -1);
});
test("stock movement validation no longer references unrelated purchase item variables", () => {
  const result = validateMovementPayload({ item: "012345678901234567890123", movementType: "STOCK_IN", quantity: 2, reason: "Delivery" });
  assert.equal(result.quantity, 2); assert.equal(result.movementType, "STOCK_IN");
});
