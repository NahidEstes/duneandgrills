import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import InventorySettings from "../models/InventorySettings.js";
import StockTransaction from "../models/StockTransaction.js";
import Production from "../models/Production.js";
import AuditLog from "../models/AuditLog.js";
import inventoryRoutes from "../routes/inventoryRoutes.js";
import { savePreparationRecipe, previewProduction, confirmProduction, productionDetails } from "../services/preparationService.js";
import { preparationHistory } from "../services/preparationHistoryService.js";

process.env.NODE_ENV = "test";
test("preparation updates against an owned disposable replica", { timeout: 120000 }, async t => withIsolatedMongo(async () => {
  const actor = await User.create({ name: "Owned updates admin", email: "updates@fixture.invalid", password: "OwnedPassword123!", role: "admin" });
  const category = await InventoryCategory.create({ name: "Owned updates", skuPrefix: "UPD" });
  const raw = await InventoryItem.create({ name: "Owned raw", sku: "UPD-1", unit: "kg", category: category._id, unitCost: 12, currentStock: 100 });
  const finished = await InventoryItem.create({ name: "Owned finished", sku: "UPD-2", unit: "kg", category: category._id, unitCost: 0, currentStock: 0 });
  const definition = { name: "Owned sauce", finishedItem: String(finished._id), outputQuantity: 2, outputUnit: "kg", ingredients: [{ inventoryItem: String(raw._id), quantity: 2500, unit: "g" }], isActive: true, notes: "Mix slowly" };
  let recipe = await savePreparationRecipe(actor, definition);
  const draft = extra => ({ recipe: String(recipe._id), expectedVersion: recipe.version, multiplier: 999, targetQuantity: 5000, targetUnit: "g", actualQuantity: 4000, outputUnit: "g", preparedAt: new Date(Date.now() - 60000).toISOString(), ingredients: [{ inventoryItem: String(raw._id), quantity: 6250, unit: "g" }], ...extra });
  const request = async body => ({ ...body, idempotencyKey: randomUUID(), previewFingerprint: (await previewProduction(actor, body)).fingerprint });
  let saved;
  await t.test("target calculator is server authoritative and missing variance reasons cannot post stock", async () => {
    const before = await StockTransaction.countDocuments(), body = draft({});
    const preview = await previewProduction(actor, body);
    assert.equal(preview.multiplier, 2.5); assert.equal(preview.expectedQuantity, 5); assert.equal(preview.ingredients[0].expectedQuantity, 6.25);
    assert.equal(preview.variance.percent, -20); assert.equal(preview.variance.requiresExplanation, true);
    await assert.rejects(confirmProduction(actor, await request(body)), /Yield explanation is required/);
    assert.equal(await StockTransaction.countDocuments(), before); assert.equal(await Production.countDocuments(), 0);
    const extra = draft({ actualQuantity: 6000 });
    assert.equal((await previewProduction(actor, extra)).variance.direction, "above");
    await assert.rejects(confirmProduction(actor, await request(extra)), /Yield explanation is required/);
    await assert.rejects(previewProduction(actor, draft({ targetUnit: "ml" })), /Unsupported conversion/);
    const exact = draft({ yieldExplanation: "Extra trimming after weighing" });
    const ready = await request(exact); saved = await confirmProduction(actor, ready);
    assert.equal(saved.multiplier, 2.5); assert.equal(saved.finishedName, finished.name); assert.equal(saved.target.baseQuantity, 5); assert.equal(saved.variance.thresholdPercent, 10);
    assert.equal((await InventoryItem.findById(raw._id)).currentStock, 93.75); assert.equal(saved.totalCost, 75);
    assert.equal(String((await confirmProduction(actor, ready))._id), String(saved._id));
    await assert.rejects(confirmProduction(actor, { ...ready, targetQuantity: 6000 }), error => error.status === 409);
  });
  await t.test("history reuses saved audit evidence, preserves production versions and paginates", async () => {
    const counts = [await StockTransaction.countDocuments(), await AuditLog.countDocuments()];
    const first = await preparationHistory(actor, recipe._id, {});
    assert.equal(first.data[0].isCreation, true); assert.equal(first.data[0].after.ingredients[0].inventoryItem, String(raw._id));
    assert.deepEqual([await StockTransaction.countDocuments(), await AuditLog.countDocuments()], counts);
    recipe = await savePreparationRecipe(actor, { ...definition, expectedVersion: recipe.version, outputQuantity: 1.8, notes: "Mix for longer", ingredients: [{ inventoryItem: String(raw._id), quantity: 2700, unit: "g" }] }, recipe._id);
    const history = await preparationHistory(actor, recipe._id, { limit: 1 });
    assert.equal(history.pagination.total, 2); assert.equal(history.data[0].before.outputQuantity, 2); assert.equal(history.data[0].after.outputQuantity, 1.8);
    assert.equal(history.data[0].before.ingredients[0].quantity, 2500); assert.equal(history.data[0].after.ingredients[0].quantity, 2700);
    assert.equal(history.data[0].actorName, actor.name);
    assert.equal((await preparationHistory(actor, recipe._id, { page: 2, limit: 1 })).data[0].after.version, 1);
    assert.equal((await productionDetails(actor, saved._id)).recipeSnapshot.version, 1);
  });
  await t.test("settings are permission protected, invalidate previews and leave saved policy unchanged", async () => {
    const previous = process.env.JWT_SECRET; process.env.JWT_SECRET = "owned-updates-fixture";
    const app = express(); app.use(express.json()); app.use("/api/inventory", inventoryRoutes); app.use((error, _req, res, _next) => res.status(error.status || 400).json({ message: error.message }));
    const server = await new Promise(resolve => { const handle = app.listen(0, "127.0.0.1", () => resolve(handle)); });
    const origin = `http://127.0.0.1:${server.address().port}/api/inventory`;
    const auth = user => ({ Authorization: `Bearer ${jwt.sign({ id: user._id, sv: 0 }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" });
    try {
      for (const role of ["storekeeper", "manager"]) {
        const user = await User.create({ name: `Owned ${role}`, email: `${role}@updates.invalid`, password: "OwnedPassword123!", role });
        const headers = auth(user);
        assert.equal((await fetch(`${origin}/preparation-recipes/${recipe._id}/history`, { headers })).status, role === "manager" ? 200 : 403);
        const options = await (await fetch(`${origin}/preparation/options`, { headers })).json(); assert.equal(options.data.canReadHistory, role === "manager");
        const response = await fetch(`${origin}/settings`, { method: "PATCH", headers, body: JSON.stringify({ productionVarianceThresholdPercent: 15 }) });
        assert.equal(response.status, role === "manager" ? 200 : 403);
      }
      const ready = await request(draft({ yieldExplanation: "Owned policy test" }));
      const headers = auth(actor);
      const changed = await fetch(`${origin}/settings`, { method: "PATCH", headers, body: JSON.stringify({ productionVarianceThresholdPercent: 5 }) });
      assert.equal(changed.status, 200);
      await assert.rejects(confirmProduction(actor, ready), /variance policy changed/);
      assert.equal((await productionDetails(actor, saved._id)).variance.thresholdPercent, 10);
      assert.equal((await InventorySettings.findOne()).productionVarianceThresholdPercent, 5);
      for (const value of [null, true, "", -1, 101]) assert.equal((await fetch(`${origin}/settings`, { method: "PATCH", headers, body: JSON.stringify({ productionVarianceThresholdPercent: value }) })).status, 400);
      const summary = await (await fetch(`${origin}/preparation-recipes`, { headers })).json(); assert.equal(summary.data[0].finishedItemName, finished.name);
      assert.equal(await Production.countDocuments(), 1);
    } finally { await new Promise(resolve => server.close(resolve)); if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; }
  });
}));
