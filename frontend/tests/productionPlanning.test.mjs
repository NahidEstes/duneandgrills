import assert from "node:assert/strict";
import { test } from "node:test";
import { plannedRecipeValues, planningBaseQuantity, formOutputVariance } from "../src/utils/productionPlanning.js";
import { productionLabelHtml } from "../src/utils/productionLabel.js";
import { outputVariance } from "../../backend/services/productionPlanning.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as quantities from "../src/utils/preparationUnits.js";

test("target planning preserves six-decimal base quantities across metric and explicit container units", () => {
  const items = [{ _id: "out", unit: "kg" }, { _id: "raw", unit: "kg", purchaseUnit: "box", purchaseConversionFactor: 5 }];
  const recipe = { _id: "recipe", finishedItem: "out", version: 1, outputUnit: "g", expectedQuantity: 2, ingredients: [{ inventoryItem: "raw", quantity: 2.5, enteredUnit: "box" }] };
  const scale = planningBaseQuantity(5000, "g", items[0]) / recipe.expectedQuantity;
  const draft = plannedRecipeValues(recipe, scale, items);
  assert.equal(draft.multiplier, "2.5"); assert.equal(draft.actualQuantity, "5000"); assert.equal(draft.ingredients[0].quantity, "1.25");
  assert.equal(planningBaseQuantity(draft.ingredients[0].quantity, "box", items[1]), 6.25);
  assert.throws(() => planningBaseQuantity(1, "ml", items[0]));
  assert.throws(() => plannedRecipeValues(recipe, 1e-10, items));
});
test("browser output variance agrees with server at precision and threshold boundaries", () => {
  const recipe = { expectedQuantity: 0.9 }, finished = { unit: "kg" };
  for (const threshold of [0, 5, 10, 100]) for (const actual of [800, 809.999, 810, 850, 900, 990, 990.001, 1100]) {
    const client = formOutputVariance({ multiplier: 1, actualQuantity: actual, outputUnit: "g" }, recipe, finished, threshold);
    const server = outputVariance(0.9, planningBaseQuantity(actual, "g", finished), threshold);
    assert.equal(client.requiresExplanation, server.requiresExplanation); assert.equal(client.direction, server.direction);
  }
});
test("labels contain immutable batch data in Riyadh time, escape HTML and reject reversed/draft batches", () => {
  const record = { status: "completed", productionNumber: "PRD-2026-000001", recipeSnapshot: { name: "Sauce <script>" }, finishedName: 'Sauce & "spice"', finishedItem: "saved-id", preparedAt: "2026-10-22T22:30:00Z", expiryDate: "2026-10-24T12:00:00+03:00" };
  const html = productionLabelHtml(record);
  assert.match(html, /23 Oct 2026, 01:30/); assert.match(html, /24 Oct 2026/); assert.match(html, /Sauce &lt;script&gt;/); assert.doesNotMatch(html, /<script>/); assert.match(html, /size: 80mm 80mm/);
  assert.match(productionLabelHtml({ ...record, finishedName: undefined, expiryDate: null }), /Name not recorded \(saved-id\)/);
  for (const status of ["draft", "reversed", undefined]) assert.throws(() => productionLabelHtml({ ...record, status }));
});

test("recipe comparison includes additions, removals, quantities, units, output, notes and status", () => {
  const require = createRequire(import.meta.url), { transformSync } = require("next/dist/build/swc");
  const file = new URL("../src/components/inventory/PreparationRecipeHistory.jsx", import.meta.url);
  const code = transformSync(readFileSync(file, "utf8"), { filename: file.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } }).code;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(id => id.endsWith("/preparationUnits.js") ? quantities : id === "react" || id.startsWith("react/") ? require(id) : {}, mod, mod.exports);
  const before = { name: "Sauce", outputQuantity: 2, outputUnit: "kg", notes: "Mix", isActive: true, ingredients: [{ inventoryItem: "a", name: "Flour", quantity: 1, unit: "kg" }, { inventoryItem: "b", name: "Salt", quantity: 20, unit: "g" }] };
  const after = { ...before, outputQuantity: 1.8, notes: "Mix longer", isActive: false, ingredients: [{ inventoryItem: "a", name: "Flour", quantity: 1200, unit: "g" }, { inventoryItem: "c", name: "Pepper", quantity: 10, unit: "g" }] };
  const comparison = mod.exports.recipeComparison(before, after);
  assert.deepEqual(comparison.map(row => row[0]), ["Expected output", "Status", "Preparation notes", "Flour", "Salt (removed)", "Pepper (added)"]);
  assert.deepEqual(comparison.find(row => row[0] === "Flour").slice(1), ["1 kg", "1,200 g"]);
  assert.equal(mod.exports.recipeComparison(before, before).length, 0);
});
