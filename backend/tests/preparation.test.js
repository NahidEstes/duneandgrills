import assert from "node:assert/strict";
import { test } from "node:test";
import { preparationBaseQuantity, preparationUnits } from "../services/preparationUnits.js";
import { savePreparationRecipe, previewProduction, confirmProduction, reverseProduction } from "../services/preparationService.js";
import mongoose from "mongoose";
import { runInventoryTransaction } from "../services/inventoryStockService.js";
test("preparation conversions preserve six-decimal base quantities and never guess mass/volume", () => {
  assert.equal(preparationBaseQuantity(350, "g", { unit: "kg" }), 0.35);
  assert.equal(preparationBaseQuantity(2, "L", { unit: "ml" }), 2000);
  assert.equal(preparationBaseQuantity(2, "bottle", { unit: "ml", purchaseUnit: "bottle", purchaseConversionFactor: 750 }), 1500);
  assert.equal(preparationBaseQuantity(1, "L", { unit: "kg", purchaseUnit: "L", purchaseConversionFactor: 0.8 }), 0.8, "Explicit configured conversion is supported");
  assert.throws(() => preparationBaseQuantity(100, "g", { unit: "ml" }), /Unsupported conversion/);
  for (const value of [0, -1, Infinity, NaN, "", true, {}, 0.00000001]) assert.throws(() => preparationBaseQuantity(value, "kg", { unit: "kg" }));
  assert.deepEqual(preparationUnits({ unit: "kg" }), ["kg", "g"]);
});
test("preparation mutation permissions are checked before database reads", async () => {
  for (const role of ["customer", "cashier", "kitchen", "rider", "accountant"]) for (const work of [() => savePreparationRecipe({ role }, {}), () => previewProduction({ role }, {}), () => confirmProduction({ role }, {})]) await assert.rejects(work(), error => error.status === 403);
  await assert.rejects(reverseProduction({ role: "storekeeper" }, "bad", {}), error => error.status === 403);
});
test("strict production transactions never use the opt-in standalone development fallback", async () => {
  const original = mongoose.startSession, previous = { NODE_ENV: process.env.NODE_ENV, ALLOW_NON_TRANSACTIONAL_INVENTORY: process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY };
  let called = false, ended = false;
  mongoose.startSession = async () => ({ withTransaction: async () => { throw Object.assign(new Error("replica set transactions unavailable"), { code: 20 }); }, endSession: async () => { ended = true; } });
  process.env.NODE_ENV = "development"; process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "true";
  try { await assert.rejects(runInventoryTransaction(async () => { called = true; }, { requireTransaction: true }), error => error.status === 503); assert.equal(called, false); assert.equal(ended, true); }
  finally { mongoose.startSession = original; for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
