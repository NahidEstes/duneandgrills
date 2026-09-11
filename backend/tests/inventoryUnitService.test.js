import assert from "node:assert/strict";
import test from "node:test";
import {
  getPurchaseConfiguration,
  toBaseQuantity,
  toBaseUnitCost,
} from "../services/inventoryUnitService.js";

test("normalizes legacy items to a one-to-one purchase configuration", () => {
  assert.deepEqual(getPurchaseConfiguration({ unit: "kg" }), {
    baseUnit: "kg",
    purchaseUnit: "kg",
    conversionFactor: 1,
  });
});

test("converts purchase quantities and costs into the inventory base unit", () => {
  const item = { unit: "bottle", purchaseUnit: "carton", purchaseConversionFactor: 24 };
  assert.deepEqual(getPurchaseConfiguration(item), {
    baseUnit: "bottle",
    purchaseUnit: "carton",
    conversionFactor: 24,
  });
  assert.equal(toBaseQuantity(2.5, 24), 60);
  assert.equal(toBaseUnitCost(48, 24), 2);
});

test("supports weight conversions without floating-point drift", () => {
  assert.equal(toBaseQuantity(1.25, 1000), 1250);
  assert.equal(toBaseUnitCost(32, 1000), 0.032);
});
