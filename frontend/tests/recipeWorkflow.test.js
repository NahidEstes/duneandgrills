import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
const read = file => readFile(new URL(`../src/components/kitchen/recipes/${file}`, import.meta.url), "utf8");
test("recipe print pages distinguish Published/Approved from draft and keep scoped page rules", async () => {
  const css = await read("recipeInstructions.css");
  assert.match(css, /@page recipe-published/); assert.match(css, /@page recipe-approved/);
  assert.match(css, /body:has\(\.recipe-workspace\[data-recipe-status="published"\]\)/);
  assert.match(css, /APPROVED · NOT YET PUBLISHED/); assert.match(css, /\.recipe-no-print.*display: none !important/s);
  const content = await read("RecipeContents.jsx"); assert.match(content, /dependencyPins\?\.find/); assert.match(content, /HISTORICAL VERSION/);
});
test("trial form defaults untested, supports measured/estimated yield, actual grams and retry keys", async () => {
  const form = await read("RecipeTrialForm.jsx");
  assert.match(form, /tested: false, score: null/); assert.match(form, /Asia\/Riyadh/); assert.match(form, /\+03:00/);
  assert.match(form, /numberOrNull\(row.quantity\)/); assert.match(form, /recordRecipeTrial/); assert.match(form, /retry.current.key/);
  assert.doesNotMatch(form, /costPer|sellingPrice|profit|deduct|stockApi/);
});
test("workflow keeps revision/trial/checklist actions explicit, history restore creates new draft", async () => {
  const form = await read("RecipeWorkflow.jsx");
  assert.match(form, /qualifyingTrialId/); assert.match(form, /qualifiedLocalSafetyReview/); assert.match(form, /Restore as NEW draft/);
  assert.match(form, /AbortController/); assert.match(form, /controller.abort/); assert.match(form, /nextBefore/);
  const page = await read("RecipeInstructions.jsx"); assert.match(page, /Authorized trial view/); assert.match(page, /requestedRevision/); assert.match(page, /controller.signal.aborted/);
  assert.match(page, /loadedView === requestScope/); assert.match(page, /user\?\._id.*user\?\.role.*view/);
});
