import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateIngredientCost,
  calculateRecipeSummary,
} from "../src/components/inventory/recipeCostUtils.js";

const inventory = new Map([
  ["patty", { unitCost: 32 }],
  ["cheese", { unitCost: 45 }],
]);

test("updates the recipe preview from quantities and database-backed item costs", () => {
  const ingredients = [
    { inventoryItem: "patty", quantityPerSale: "0.15", isActive: true },
    { inventoryItem: "cheese", quantityPerSale: "0.02", isActive: true },
  ];
  const summary = calculateRecipeSummary({
    ingredients,
    sellingPrice: 15.97,
    detailsFor: (line) => inventory.get(line.inventoryItem),
  });

  assert.equal(calculateIngredientCost({ quantityPerSale: 0.15, costPerUnit: 32 }), 4.8);
  assert.deepEqual(summary, {
    totalEstimatedIngredientCost: 5.7,
    sellingPrice: 15.97,
    estimatedProfit: 10.27,
    profitMargin: 64.3,
  });
});

test("excludes inactive ingredients and clears costing for do-not-track recipes", () => {
  const ingredients = [{ inventoryItem: "patty", quantityPerSale: 1, isActive: false }];
  const summary = calculateRecipeSummary({
    ingredients,
    sellingPrice: 20,
    detailsFor: (line) => inventory.get(line.inventoryItem),
    doNotTrack: true,
  });

  assert.equal(summary.totalEstimatedIngredientCost, 0);
  assert.equal(summary.estimatedProfit, 20);
  assert.equal(summary.profitMargin, 100);
});
