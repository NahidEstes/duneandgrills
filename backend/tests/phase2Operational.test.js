import assert from "node:assert/strict";
import test from "node:test";
import { auditDiff } from "../services/auditLogService.js";
import { calculateExpectedCashHalala } from "../services/posShiftService.js";
import { resolveLineCustomization } from "../services/menuCustomizationService.js";
import { fromHalala, positiveHalala, toHalala } from "../utils/money.js";

test("money helpers use integer halala and reject invalid values", () => {
  assert.equal(toHalala(10.1), 1010);
  assert.equal(toHalala("0.29"), 29);
  assert.equal(fromHalala(1234), 12.34);
  assert.throws(() => positiveHalala(0), /greater than zero/);
});

test("expected cash excludes card sales and respects cash directions", () => {
  assert.equal(calculateExpectedCashHalala([
    { type: "opening_cash", amountHalala: 10000, direction: "in" },
    { type: "cash_sale", amountHalala: 4500, direction: "in" },
    { type: "cash_in", amountHalala: 500, direction: "in" },
    { type: "cash_refund", amountHalala: 1200, direction: "out" },
    { type: "payout", amountHalala: 300, direction: "out" },
  ]), 13500);
});

test("add-on quantity is included in authoritative pricing snapshot", () => {
  const addOnId = "66aa11111111111111111111";
  const productId = "66bb11111111111111111111";
  const result = resolveLineCustomization({
    product: { _id: productId, customization: { enabled: true, spice: { enabled: false, options: [] } } },
    productType: "menuItem",
    request: { requested: true, selectedAddOns: [{ id: addOnId, quantity: 2 }], spiceLevel: "", note: "" },
    addOnMap: new Map([[addOnId, { _id: addOnId, name: "Cheese", image: "", price: 3, isActive: true, menuItems: [productId] }]]),
  });
  assert.equal(result.selectedAddOns[0].quantity, 2);
  assert.equal(result.addOnTotal, 6);
});

test("audit diff reports only changed paths", () => {
  assert.deepEqual(auditDiff({ stock: 4, settings: { threshold: 2 } }, { stock: 3, settings: { threshold: 2 } }), ["stock"]);
});
