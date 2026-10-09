import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { RECIPE_PILOT } from "../../backend/data/recipeInstructionPilot.js";
import { quantityLabel, recipeMatches, resolveRecipe, RECIPE_CATEGORIES, RECIPE_TABS } from "../src/components/kitchen/recipes/recipePresentation.js";
test("pilot search/category and S1 alias navigation; Kitchen Guides supported without invented data", () => {
  assert.deepEqual(RECIPE_CATEGORIES, ["Main Recipes", "Preparation Recipes", "Kitchen Guides"]);
  assert.equal(RECIPE_PILOT.filter(row => recipeMatches(row, "s1", "All")).length, 1);
  assert.equal(RECIPE_PILOT.filter(row => recipeMatches(row, "", "Preparation Recipes")).length, 2);
  assert.equal(RECIPE_PILOT.filter(row => recipeMatches(row, "", "Kitchen Guides")).length, 0);
  assert.equal(resolveRecipe(RECIPE_PILOT, "S1").code, "HB01");
  assert.equal(resolveRecipe(RECIPE_PILOT, "unknown"), undefined);
});
test("verified quantities, decimals and slice/bun counts; presets don't mutate process controls", () => {
  const before = structuredClone(RECIPE_PILOT);
  assert.equal(quantityLabel(RECIPE_PILOT[0].ingredients[1], 0), "1.6 g");
  assert.equal(quantityLabel(RECIPE_PILOT[0].ingredients[2], 0), "0.3 g");
  assert.equal(quantityLabel(RECIPE_PILOT[0].ingredients[4], 0), "2 slices × 15 g / 30 g");
  assert.equal(quantityLabel(RECIPE_PILOT[1].ingredients[0], 1), "600 g");
  assert.equal(quantityLabel(RECIPE_PILOT[2].ingredients[0], 1), "Unavailable");
  assert.deepEqual(RECIPE_PILOT, before);
});
test("all required sections, print exposes hidden sections but not management, guards and no stock API", async () => {
  assert.deepEqual(RECIPE_TABS.map(row => row[0]), ["ingredients", "preparation", "cooking", "serving", "storage"]);
  const css = await readFile(new URL("../src/components/kitchen/recipes/recipeInstructions.css", import.meta.url), "utf8");
  assert.match(css, /@media print/); assert.match(css, /\.recipe-print-only \{ display: block !important/); assert.match(css, /\.recipe-no-print.*display: none !important/s);
  assert.match(css, /@bottom-center.*NOT APPROVED FOR REGULAR SERVICE/);
  assert.match(css, /@page recipe-instructions/); assert.match(css, /page: recipe-instructions/);
  const page = await readFile(new URL("../app/kitchen/recipes/page.jsx", import.meta.url), "utf8"); assert.match(page, /ProtectedRoute roles=\{\["admin", "manager", "kitchen"\]/);
  const api = await readFile(new URL("../src/api/recipeInstructionsApi.js", import.meta.url), "utf8"); assert.doesNotMatch(api, /stock|orders|cost|payments|upload/);
});
