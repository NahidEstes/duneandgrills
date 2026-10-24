import assert from "node:assert/strict";
import test from "node:test";
import { planningBaseQuantity, plannedRecipeValues } from "../src/utils/productionPlanning.js";
import { preparationUnits } from "../src/utils/preparationUnits.js";
import { preparationBaseQuantity, preparationUnits as serverUnits } from "../../backend/services/preparationUnits.js";

test("recipe hints match authoritative conversions and choices for all metric base and entry units", () => {
  for (const unit of ["kg", "g", "L", "ml"]) for (const enabled of [true, false]) {
    const item = { unit, weightVolumeConversion: { enabled, gramsPerLiter: 920 } };
    assert.deepEqual(preparationUnits(item), serverUnits(item));
    for (const enteredUnit of preparationUnits(item)) assert.equal(planningBaseQuantity(20, enteredUnit, item), preparationBaseQuantity(20, enteredUnit, item));
  }
});

test("production defaults preserve saved density-based recipes after conversion changes or disabling", () => {
  const recipe = { _id: "prep", version: 1, finishedItem: "output", baseUnit: "L", outputUnit: "g", expectedQuantity: .021739, outputConversionSnapshot: { factor: 1 / 920, gramsPerLiter: 920 }, ingredients: [{ inventoryItem: "oil", quantity: .021739, enteredQuantity: 20, enteredUnit: "g", unit: "L", conversionSnapshot: { factor: 1 / 920, gramsPerLiter: 920 } }] };
  const items = ["oil", "output"].map(_id => ({ _id, unit: "L", weightVolumeConversion: { enabled: false, gramsPerLiter: 900 } }));
  const draft = plannedRecipeValues(recipe, 2, items);
  assert.equal(draft.outputUnit, "L"); assert.equal(Number(draft.actualQuantity), .043478);
  assert.equal(draft.ingredients[0].unit, "L"); assert.equal(Number(draft.ingredients[0].quantity), .043478);
});
