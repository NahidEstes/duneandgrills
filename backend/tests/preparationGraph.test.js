import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePreparationGraph } from "../services/preparationGraph.js";
const recipe = (finishedItem, inputs, isActive = true) => ({ name: finishedItem, finishedItem, ingredients: inputs.map(inventoryItem => ({ inventoryItem })), isActive });
test("complete preparation graph accepts shared inputs and long chains without recursion", () => {
  validatePreparationGraph([recipe("A", ["raw"]), recipe("B", ["A"]), recipe("C", ["B", "A"])]);
  validatePreparationGraph(Array.from({ length: 15000 }, (_, i) => recipe(String(i), [String(i + 1)])));
});
test("self, direct, indirect and inactive cycles and duplicate finished definitions are rejected", () => {
  for (const graph of [[recipe("A", ["A"])], [recipe("A", ["B"]), recipe("B", ["A"])], [recipe("A", ["B"]), recipe("B", ["C"], false), recipe("C", ["A"])]]) assert.throws(() => validatePreparationGraph(graph), /Preparation cycle detected/);
  assert.throws(() => validatePreparationGraph([recipe("A", ["raw"]), recipe("A", ["other"], false)]), /already has/);
});
