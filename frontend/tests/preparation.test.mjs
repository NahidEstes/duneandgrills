import assert from "node:assert/strict";
import { test } from "node:test";
import { preparationUnits, preparationQuantityLabel } from "../src/utils/preparationUnits.js";
import { preparationUnits as serverUnits } from "../../backend/services/preparationUnits.js";
test("preparation selection hints match server-compatible units, including explicitly configured containers", () => {
  for (const unit of ["kg", "g", "L", "ml", "pcs", "box"]) for (const configured of [{}, { purchaseUnit: "bottle", purchaseConversionFactor: 750 }]) {
    const item = { unit, ...configured }; assert.deepEqual(preparationUnits(item), serverUnits(item));
  }
  assert.equal(preparationUnits({ unit: "kg" }).includes("ml"), false);
});
test("small production base quantities stay readable, and missing batch balances never display zero", () => {
  assert.equal(preparationQuantityLabel(0.000001, "kg"), "0.000001 kg");
  assert.equal(preparationQuantityLabel(0, "kg"), "0 kg");
  assert.equal(preparationQuantityLabel(null, "kg"), "Unavailable");
  assert.equal(preparationQuantityLabel(undefined, "kg"), "Unavailable");
});
