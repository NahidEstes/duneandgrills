import assert from "node:assert/strict";
import test from "node:test";
import { calculateRecipeCosts } from "../services/recipeCostService.js";

test("calculates authoritative recipe costs from inventory item unit costs", () => {
  const result = calculateRecipeCosts({
    sellingPrice: 15.97,
    ingredients: [
      { quantityPerSale: 0.15, inventoryItem: { unitCost: 32 }, isActive: true },
      { quantityPerSale: 0.02, inventoryItem: { unitCost: 45 }, isActive: true },
      { quantityPerSale: 2, inventoryItem: { unitCost: 5 }, isActive: false },
    ],
  });

  assert.deepEqual(result.lines, [
    { costPerUnit: 32, ingredientCostPerDish: 4.8 },
    { costPerUnit: 45, ingredientCostPerDish: 0.9 },
    { costPerUnit: 5, ingredientCostPerDish: 0 },
  ]);
  assert.equal(result.totalEstimatedIngredientCost, 5.7);
  assert.equal(result.estimatedProfit, 10.27);
  assert.equal(result.profitMargin, 64.3);
  assert.equal(result.currency, "SAR");
});

test("ignores client-like cost fields and handles a zero selling price", () => {
  const result = calculateRecipeCosts({
    sellingPrice: 0,
    ingredients: [{
      quantityPerSale: 0.333,
      costPerUnit: 999,
      ingredientCostPerDish: 999,
      inventoryItem: { unitCost: 10.125 },
    }],
  });

  assert.equal(result.lines[0].costPerUnit, 10.13);
  assert.equal(result.lines[0].ingredientCostPerDish, 3.37);
  assert.equal(result.totalEstimatedIngredientCost, 3.37);
  assert.equal(result.estimatedProfit, -3.37);
  assert.equal(result.profitMargin, 0);
});
