import assert from "node:assert/strict";
import test from "node:test";
import { preparationBaseQuantity, preparationUnits } from "../services/preparationUnits.js";
import { normalizeRecipeQuantity } from "../services/recipeUnitConversion.js";
import { validateItemPayload } from "../utils/inventoryValidation.js";

const config = { enabled: true, gramsPerLiter: 920, verificationNote: "Owned test measurement" };
test("verified density converts every mass/volume pair in both directions without assuming water density", () => {
  const quantities = { kg: .02, g: 20, L: 20 / 920, ml: 20000 / 920 };
  for (const unit of Object.keys(quantities)) for (const enteredUnit of Object.keys(quantities)) {
    assert.equal(preparationBaseQuantity(quantities[enteredUnit], enteredUnit, { unit, weightVolumeConversion: config }), Number(quantities[unit].toFixed(6)));
    assert.ok(preparationUnits({ unit, weightVolumeConversion: config }).includes(enteredUnit));
  }
  assert.equal(preparationBaseQuantity(1, "L", { unit: "kg", purchaseUnit: "L", purchaseConversionFactor: .8, weightVolumeConversion: config }), .8, "Existing explicit purchase conversions keep precedence");
  for (const weightVolumeConversion of [undefined, { ...config, enabled: false }]) assert.throws(() => preparationBaseQuantity(20, "g", { unit: "L", weightVolumeConversion }), /verified/);
  for (const value of [true, false, "", NaN, Infinity, -1, 0, 1e10, 1e-10]) assert.throws(() => preparationBaseQuantity(value, "g", { unit: "L", weightVolumeConversion: config }));
  assert.throws(() => preparationBaseQuantity(1, "pcs", { unit: "L", weightVolumeConversion: config }), /Unsupported/);
});

test("configuration validates explicit settings and positive finite densities with no default", () => {
  assert.equal(validateItemPayload({}, { partial: true }).weightVolumeConversion, undefined);
  assert.deepEqual(validateItemPayload({ weightVolumeConversion: config }, { partial: true }).weightVolumeConversion, config);
  assert.equal(validateItemPayload({ weightVolumeConversion: { enabled: false } }, { partial: true }).weightVolumeConversion.gramsPerLiter, null);
  for (const gramsPerLiter of [undefined, null, "", true, false, {}, 0, -1, Infinity, NaN, 1e10, 1e-10]) assert.throws(() => validateItemPayload({ weightVolumeConversion: { enabled: true, gramsPerLiter } }, { partial: true }));
  for (const weightVolumeConversion of [null, [], "on", {}, { enabled: "false" }, { ...config, verificationNote: 1 }, { ...config, verificationNote: "x".repeat(501) }]) assert.throws(() => validateItemPayload({ weightVolumeConversion }, { partial: true }));
});

test("saved base quantities and conversion evidence survive configuration changes and disabling", () => {
  const item = { unit: "L", weightVolumeConversion: config };
  const previous = { ...normalizeRecipeQuantity({ quantity: 20, enteredUnit: "g", item, requireReview: true, expectedGramsPerLiter: 920 }), unit: "L" };
  assert.equal(previous.quantity, .021739);
  for (const weightVolumeConversion of [{ ...config, gramsPerLiter: 900 }, { ...config, enabled: false }]) {
    const preserved = normalizeRecipeQuantity({ quantity: "20", enteredUnit: "g", item: { ...item, weightVolumeConversion }, previous, requireReview: true });
    assert.equal(preserved.quantity, .021739); assert.equal(preserved.conversionSnapshot.gramsPerLiter, 920);
  }
  const changed = { ...item, weightVolumeConversion: { ...config, gramsPerLiter: 900 } };
  assert.throws(() => normalizeRecipeQuantity({ quantity: 20, enteredUnit: "g", item: changed, previous, reapplyConversion: true, requireReview: true, expectedGramsPerLiter: 920 }), error => error.status === 409);
  assert.equal(normalizeRecipeQuantity({ quantity: 20, enteredUnit: "g", item: changed, previous, reapplyConversion: true, requireReview: true, expectedGramsPerLiter: 900 }).quantity, .022222);
  assert.throws(() => normalizeRecipeQuantity({ quantity: 21, enteredUnit: "g", item: changed, previous, requireReview: true }), error => error.status === 409);
  assert.equal(normalizeRecipeQuantity({ quantity: 20, enteredUnit: "g", item: { ...item, unit: "kg" }, previous }).quantity, .02, "Explicit saves can repair recipes after a separately changed base unit; never reuse an old quantity under a new unit");
});
