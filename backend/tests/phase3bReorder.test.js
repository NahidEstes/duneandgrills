import assert from "node:assert/strict";
import test from "node:test";
import { calculateReorderRecommendation } from "../services/reorderService.js";

test("calculates projected stock with reservations and confirmed inbound", () => {
  const row = calculateReorderRecommendation({ usableOnHand: 12, reservedQuantity: 3, confirmedInbound: 6, reorderPoint: 20, targetStock: 40, conversionFactor: 1, minimumOrderQuantity: 1, orderMultiple: 1 });
  assert.equal(row.projectedAvailable, 15);
  assert.equal(row.rawBaseQuantity, 25);
  assert.equal(row.finalPurchaseQuantity, 25);
});

test("uses lead-time demand and safety stock when reliable history exists", () => {
  const row = calculateReorderRecommendation({ usableOnHand: 5, confirmedInbound: 0, reorderPoint: 3, targetStock: 8, safetyStock: 4, averageDailyUsage: 2, leadTimeDays: 7, conversionFactor: 1, minimumOrderQuantity: 1, orderMultiple: 1 });
  assert.equal(row.leadTimeDemand, 14);
  assert.equal(row.effectiveReorderPoint, 18);
  assert.equal(row.effectiveTarget, 18);
  assert.equal(row.finalPurchaseQuantity, 13);
});

test("falls back to static policy without reliable usage", () => {
  const row = calculateReorderRecommendation({ usableOnHand: 4, reorderPoint: 5, targetStock: 12, safetyStock: 2, averageDailyUsage: null, leadTimeDays: 9, conversionFactor: 1, minimumOrderQuantity: 1, orderMultiple: 1 });
  assert.equal(row.demandAware, false);
  assert.equal(row.effectiveReorderPoint, 5);
  assert.equal(row.finalPurchaseQuantity, 8);
});

test("normalizes base shortage to purchase units then applies MOQ and pack multiple", () => {
  const row = calculateReorderRecommendation({ usableOnHand: 10, reorderPoint: 20, targetStock: 100, conversionFactor: 24, minimumOrderQuantity: 5, orderMultiple: 3 });
  assert.equal(row.rawBaseQuantity, 90);
  assert.equal(row.rawPurchaseQuantity, 3.75);
  assert.equal(row.moqApplied, 5);
  assert.equal(row.finalPurchaseQuantity, 6);
  assert.equal(row.finalBaseQuantity, 144);
});

test("does not suggest negative or excess stock purchases", () => {
  const row = calculateReorderRecommendation({ usableOnHand: 30, confirmedInbound: 10, reorderPoint: 10, targetStock: 25, conversionFactor: 5, minimumOrderQuantity: 2, orderMultiple: 2 });
  assert.equal(row.finalPurchaseQuantity, 0);
  assert.equal(row.finalBaseQuantity, 0);
});
