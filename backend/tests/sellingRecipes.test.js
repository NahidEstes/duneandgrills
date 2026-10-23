import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { calculateRecipeCosts } from "../services/recipeCostService.js";
import { recipeCsv, sellingHistorySnapshot, saveSellingRecipe } from "../services/sellingRecipeService.js";

test("reference costs distinguish unknown, invalid, valid zero and untracked mappings", () => {
  for (const cost of [null, undefined, "", "  ", true, -1, Infinity, 1e308, "bad"]) {
    const result = calculateRecipeCosts({ ingredients: [{ quantityPerSale: 1, inventoryItem: { unitCost: cost } }], sellingPrice: 20 });
    assert.equal(result.totalEstimatedIngredientCost, null); assert.equal(result.estimatedProfit, null); assert.equal(result.profitMargin, null);
  }
  const zero = calculateRecipeCosts({ ingredients: [{ quantityPerSale: 1, inventoryItem: { unitCost: 0 } }], sellingPrice: 20 });
  assert.equal(zero.totalEstimatedIngredientCost, 0); assert.equal(zero.costConfidence, "reference_complete");
  const excluded = calculateRecipeCosts({ ingredients: [{ quantityPerSale: 1, inventoryItem: { unitCost: 0 } }], sellingPrice: 20, doNotTrack: true });
  assert.equal(excluded.totalEstimatedIngredientCost, null); assert.equal(excluded.profitMargin, null);
});
test("recipe CSV neutralizes formulas and preserves unknown totals rather than fabricating zero", () => {
  const csv = recipeCsv([{ name: '=HYPERLINK("bad")', category: "\t=attack", price: 20, recipeStatus: "not_configured", metrics: { totalEstimatedIngredientCost: null, estimatedProfit: null, profitMargin: null, costConfidence: "incomplete" } }], "menu");
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"')); assert.ok(csv.includes('"\'\t=attack"'));
  assert.ok(csv.includes('"20","","","incomplete","",""'));
});
test("history decodes exact saved identities without inventing missing names, units or revision", () => {
  const id = new mongoose.Types.ObjectId();
  const old = sellingHistorySnapshot({ ingredients: [{ inventoryItem: { buffer: Object.fromEntries([...id.id].map((v, i) => [i, v])) }, quantityPerSale: 0.25 }], isActive: true }, "quantityPerSale");
  assert.equal(old.ingredients[0].inventoryItem, String(id)); assert.equal(old.ingredients[0].quantity, .25);
  assert.equal(old.ingredients[0].name, null); assert.equal(old.ingredients[0].unit, null); assert.equal(old.revision, null);
});
test("configuration writes fail closed without transactions even with the development fallback enabled", async () => {
  const start = mongoose.startSession, previous = process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY;
  process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "true";
  mongoose.startSession = async () => ({ withTransaction: async () => { throw Object.assign(new Error("Transactions are not supported"), { code: 20 }); }, endSession: async () => {} });
  try { await assert.rejects(saveSellingRecipe({ role: "admin" }, "menu", String(new mongoose.Types.ObjectId()), { expectedRevision: null }), error => error.status === 503); }
  finally { mongoose.startSession = start; if (previous === undefined) delete process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY; else process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = previous; }
});
