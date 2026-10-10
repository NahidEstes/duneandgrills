import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { RECIPE_LIBRARY } from "../../backend/data/recipeInstructionPilot.js";
import { recipeMatches, resolveRecipe, quantityLabel } from "../src/components/kitchen/recipes/recipePresentation.js";
test("complete manual searchable by codes/alias/name and categories, quantities preserve process",()=>{
  assert.equal(RECIPE_LIBRARY.filter(row=>recipeMatches(row,"","Main Recipes")).length,7);
  assert.equal(RECIPE_LIBRARY.filter(row=>recipeMatches(row,"","Preparation Recipes")).length,10);
  assert.equal(RECIPE_LIBRARY.filter(row=>recipeMatches(row,"","Kitchen Guides")).length,5);
  assert.equal(resolveRecipe(RECIPE_LIBRARY,"S1").code,"HB01");
  assert.equal(resolveRecipe(RECIPE_LIBRARY,"CS01").name,"Cheddar Cheese Sauce");
  const before=structuredClone(RECIPE_LIBRARY);
  for(const row of RECIPE_LIBRARY) for(const index of row.presets.keys()) for(const ingredient of row.ingredients) assert.notEqual(quantityLabel(ingredient,index),"Unavailable");
  assert.deepEqual(RECIPE_LIBRARY,before);
});
test("guide form never invents cooking measurements, links are API options, print and private states retained",async()=>{
  const read=file=>readFile(new URL(`../src/components/kitchen/recipes/${file}`,import.meta.url),"utf8");
  const form=await read("GuideRehearsalForm.jsx"); assert.match(form,/staffRehearsal/); assert.match(form,/retry.current.key/); assert.doesNotMatch(form,/batchValue|yieldValue|score:|costPer|stockApi/);
  const editor=await read("RecipeRevisionEditor.jsx"); assert.match(editor,/preparationOptions.map/); assert.match(editor,/!guide &&/);
  const contents=await read("RecipeContents.jsx"); assert.match(contents,/dependencyPins\?\.find/); assert.match(contents,/Shared source guide/);
  const page=await read("RecipeInstructions.jsx"); assert.match(page,/router.back/); assert.match(page,/No matching recipes or guides/); assert.match(page,/Private|private/);
});
