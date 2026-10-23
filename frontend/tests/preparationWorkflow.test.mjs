import assert from "node:assert/strict";
import { test } from "node:test";
import { preparationSequence, stockImpact } from "../src/utils/preparationWorkflow.js";

test("sequence orders shared upstream inputs once, includes inactive recipes, and labels explicit truncation", () => {
  const recipe = (finishedItem, inputs, isActive = true) => ({ finishedItem, isActive, ingredients: inputs.map(inventoryItem => ({ inventoryItem })) });
  const recipes = [recipe("sliced", ["whole"], false), recipe("caramel", ["sliced", "oil"]), recipe("final", ["caramel", "sliced"])];
  const result = preparationSequence(recipes[2], recipes, []);
  assert.deepEqual(result.nodes.map(row => row.id), ["whole", "sliced", "oil", "caramel", "final"]);
  assert.equal(result.nodes.find(row => row.id === "sliced").recipe.isActive, false);
  assert.equal(preparationSequence(recipes[2], recipes, [], 2).truncated, true);
  assert.deepEqual(preparationSequence(null, recipes, []).nodes, []);
});
test("stock impact keeps physical and usable stock distinct and missing balances unknown", () => {
  const plan = { ingredients: [{ name: "Sliced", unit: "g", quantity: 500, physicalStock: 1000, available: 900 }], finishedName: "Caramel", unit: "g", actualQuantity: 450, finishedPhysicalStock: 0 };
  const rows = stockImpact(plan);
  assert.deepEqual(rows.map(row => [row.before, row.change, row.after]), [[1000, -500, 500], [0, 450, 450]]);
  assert.equal(stockImpact({ ...plan, finishedPhysicalStock: undefined })[1].after, null);
});
