import assert from "node:assert/strict";
import { test } from "node:test";
import { outputVariance, varianceThreshold, productionTarget } from "../services/productionPlanning.js";
import { recipeHistorySnapshot, preparationHistory } from "../services/preparationHistoryService.js";
import mongoose from "mongoose";

test("output variance uses output target, both directions and strict threshold boundaries", () => {
  assert.equal(outputVariance(900, 810).requiresExplanation, false);
  assert.equal(outputVariance(900, 809.999999).requiresExplanation, true);
  assert.equal(outputVariance(900, 990).requiresExplanation, false);
  assert.equal(outputVariance(900, 990.000001).requiresExplanation, true);
  assert.equal(outputVariance(900, 850).direction, "below");
  assert.equal(outputVariance(900, 1000).direction, "above");
  assert.equal(outputVariance(900, 900, 0).requiresExplanation, false);
  assert.equal(outputVariance(900, 899.999999, 0).requiresExplanation, true);
  for (const value of [null, "", true, NaN, -1, 101, {}]) assert.throws(() => varianceThreshold(value));
});
test("target output is authoritative, converts compatible units and rejects unsupported targets", () => {
  const recipe = { expectedQuantity: 2 }, item = { unit: "kg", purchaseUnit: "box", purchaseConversionFactor: 5 };
  for (const [quantity, unit] of [[5, "kg"], [5000, "g"], [1, "box"]]) {
    const result = productionTarget({ targetQuantity: quantity, targetUnit: unit, multiplier: 999 }, recipe, item);
    assert.equal(result.multiplier, 2.5); assert.equal(result.target.baseQuantity, 5);
  }
  assert.equal(productionTarget({ multiplier: 2 }, recipe, item).multiplier, 2);
  for (const extra of [{ targetQuantity: 0, targetUnit: "kg" }, { targetQuantity: 1, targetUnit: "ml" }, { targetQuantity: 0.00000001, targetUnit: "kg" }, { targetQuantity: 1 }, { targetUnit: "kg" }]) assert.throws(() => productionTarget(extra, recipe, item));
});
test("history decodes old saved ObjectId bytes and marks incomplete evidence unavailable", async () => {
  const id = new mongoose.Types.ObjectId();
  const oldId = { buffer: Object.fromEntries([...id.id].map((value, index) => [index, value])) };
  const source = { version: 1, name: "Sauce", finishedItem: oldId, outputQuantity: 2, outputUnit: "kg", notes: "", isActive: true, ingredients: [{ inventoryItem: oldId, name: "Raw", enteredQuantity: 3, enteredUnit: "kg" }] };
  assert.equal(recipeHistorySnapshot(source).finishedItem, String(id));
  assert.equal(recipeHistorySnapshot(source).ingredients[0].inventoryItem, String(id));
  assert.equal(recipeHistorySnapshot({ ...source, outputQuantity: undefined }), null);
  assert.equal(recipeHistorySnapshot({ ...source, ingredients: [{ ...source.ingredients[0], inventoryItem: {} }] }), null);
  for (const role of ["storekeeper", "inventory", "accountant", "cashier"]) await assert.rejects(preparationHistory({ role }, "bad", {}), error => error.status === 403);
});
