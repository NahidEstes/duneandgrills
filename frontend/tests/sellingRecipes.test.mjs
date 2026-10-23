import assert from "node:assert/strict";
import test from "node:test";
import { draftFromRecipe, draftEqual, formatReferenceCost } from "../src/components/inventory/sellingRecipeUtils.js";
import { calculateIngredientCost, calculateRecipeSummary } from "../src/components/inventory/recipeCostUtils.js";

test("saved menu and addon mappings hydrate entered units and legacy base quantities independently of option pages", () => {
  const record = { recipe: { doNotTrack: false, isActive: false, ingredients: [
    { inventoryItem: { _id: "beyond-page-100" }, quantityPerSale: .25, enteredQuantity: 250, enteredUnit: "g", unit: "kg", isActive: true },
    { inventoryItem: null, quantityPerSale: .1, unit: "kg", isActive: false },
  ] } };
  const draft = draftFromRecipe(record, "menu");
  assert.equal(draft.ingredients[0].quantity, "250"); assert.equal(draft.ingredients[0].enteredUnit, "g"); assert.equal(draft.ingredients[0].inventoryItem, "beyond-page-100");
  assert.equal(draft.ingredients[1].quantity, "0.1"); assert.equal(draft.ingredients[1].inventoryItem, ""); assert.equal(draft.isActive, false);
  assert.equal(draftFromRecipe({ recipe: { ingredients: [{ inventoryItem: "legacy", quantityPerAddOn: .12, unit: "L" }] } }, "addon").ingredients[0].quantity, "0.12");
  assert.equal(draftEqual(draft, structuredClone(draft)), true);
  const changed = structuredClone(draft); changed.ingredients[0].quantity = "500"; assert.equal(draftEqual(draft, changed), false);
});
test("unknown/invalid references and untracked recipes cannot display zero-cost verified margins", () => {
  for (const cost of [null, undefined, "", "  ", false, -1, Infinity, 1e308]) assert.equal(calculateIngredientCost({ quantityPerSale: 1, costPerUnit: cost }), null);
  const unknown = calculateRecipeSummary({ ingredients: [{ inventoryItem: "x", quantityPerSale: 1, isActive: true }], sellingPrice: 20, detailsFor: () => ({ unitCost: null }) });
  assert.equal(unknown.totalEstimatedIngredientCost, null); assert.equal(unknown.profitMargin, null); assert.equal(formatReferenceCost(null), "Unavailable");
  const zero = calculateRecipeSummary({ ingredients: [{ quantityPerSale: 1, isActive: true }], sellingPrice: 20, detailsFor: () => ({ unitCost: 0 }) });
  assert.equal(zero.totalEstimatedIngredientCost, 0); assert.equal(zero.profitMargin, 100); assert.equal(formatReferenceCost(0), "SAR 0.00");
});
