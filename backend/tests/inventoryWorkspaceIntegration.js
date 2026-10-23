import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryBatch from "../models/InventoryBatch.js";
import StockTransaction from "../models/StockTransaction.js";
import AuditLog from "../models/AuditLog.js";
import Expense from "../models/Expense.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import InventorySettings from "../models/InventorySettings.js";
import InventoryMovementRequest from "../models/InventoryMovementRequest.js";
import inventoryRoutes from "../routes/inventoryRoutes.js";
import { previewStockAction, confirmStockAction, findStockAction } from "../services/inventoryMovementReviewService.js";
import { buildInventoryDashboard } from "../services/inventoryAnalyticsService.js";
import { savePreparationRecipe } from "../services/preparationService.js";

process.env.NODE_ENV = "test";
test("inventory workspace and reviewed actions use owned local stock only", { timeout: 120000 }, async t => withIsolatedMongo(async () => {
  const actor = await User.create({ name: "Owned workspace admin", email: "workspace@fixture.invalid", password: "OwnedPassword123!", role: "admin" });
  const category = await InventoryCategory.create({ name: "Owned workspace", skuPrefix: "WSK" });
  await InventorySettings.create({ key: "default" });
  await InventoryItem.insertMany(Array.from({ length: 105 }, (_, i) => ({ name: `A fixture ${String(i).padStart(3, "0")}`, sku: `WSK-${i}`, category: category._id, unit: "kg", currentStock: 0 })));
  const item = await InventoryItem.create({ name: "ZZ target ingredient", sku: "WSK-TARGET", category: category._id, unit: "kg", purchaseUnit: "box", purchaseConversionFactor: 5, currentStock: 100, unitCost: 2 });
  const output = await InventoryItem.create({ name: "Owned prepared output", sku: "WSK-OUTPUT", category: category._id, unit: "kg", currentStock: 0 });
  await savePreparationRecipe(actor, { name: "Owned workspace recipe", finishedItem: String(output._id), outputQuantity: 1, outputUnit: "kg", ingredients: [{ inventoryItem: String(item._id), quantity: 1, unit: "kg" }], isActive: true });
  const draft = extra => ({ kind: "movement", movementType: "STOCK_IN", item: String(item._id), quantity: 2, reason: "Owned delivery outside PO", ...extra });
  const request = async body => ({ ...body, idempotencyKey: randomUUID(), previewFingerprint: (await previewStockAction(actor, body)).fingerprint });
  await t.test("preview is read-only; confirmation converts purchase units once and concurrent retries post once", async () => {
    const before = [await StockTransaction.countDocuments(), await AuditLog.countDocuments(), await InventoryBatch.countDocuments()];
    const plan = await previewStockAction(actor, draft({})); assert.equal(plan.baseQuantity, 10); assert.equal(plan.stockBefore, 100); assert.equal(plan.stockAfter, 110);
    assert.deepEqual([await StockTransaction.countDocuments(), await AuditLog.countDocuments(), await InventoryBatch.countDocuments()], before);
    const body = await request(draft({ unitCost: 15 }));
    const [a, b] = await Promise.all([confirmStockAction(actor, body), confirmStockAction(actor, body)]);
    assert.equal(String(a._id), String(b._id)); assert.equal((await InventoryItem.findById(item._id)).currentStock, 110); assert.equal(await StockTransaction.countDocuments(), 1);
    assert.equal(a.sourceDetails.baseUnit, "kg");
    const batch = await InventoryBatch.findOne({ sourceTransaction: a._id }); assert.equal(batch.unitCost, 3); assert.equal(batch.remainingQuantity, 10);
    assert.equal(String((await findStockAction(actor, body.idempotencyKey))._id), String(a._id));
    await assert.rejects(confirmStockAction(actor, { ...body, quantity: 3 }), error => error.status === 409);
    assert.equal(await Expense.countDocuments(), 0); assert.equal(await SupplierInvoice.countDocuments(), 0);
  });
  await t.test("stale configuration/evidence and late write failures cannot post partial movements", async () => {
    const stale = await request(draft({}));
    await InventoryItem.updateOne({ _id: item._id }, { $inc: { stockVersion: 1 } });
    await assert.rejects(confirmStockAction(actor, stale), error => error.status === 409);
    const before = (await InventoryItem.findById(item._id)).currentStock, count = await StockTransaction.countDocuments();
    const bad = await request(draft({ lotNumber: "X".repeat(81) }));
    await assert.rejects(confirmStockAction(actor, bad), /lotNumber/);
    assert.equal((await InventoryItem.findById(item._id)).currentStock, before); assert.equal(await StockTransaction.countDocuments(), count);
    assert.equal(await InventoryMovementRequest.countDocuments(), 1);
    await assert.rejects(previewStockAction(actor, draft({ purchaseOrder: String(output._id) })), /linked purchase receipt/);
  });
  await t.test("waste, normal deductions and exact adjustments preserve batch evidence and original costs", async () => {
    const counts = [await Expense.countDocuments(), await SupplierInvoice.countDocuments()];
    const out = await confirmStockAction(actor, await request(draft({ movementType: "STOCK_OUT", quantity: 1 })));
    assert.equal(out.stockAfter, 109);
    const waste = await confirmStockAction(actor, await request({ kind: "waste", movementType: "WASTE", item: String(item._id), quantity: 1, reasonCode: "SPILLAGE" }));
    assert.equal(waste.stockAfter, 108); assert.equal(waste.reasonCode, "SPILLAGE");
    const adjustment = await confirmStockAction(actor, await request(draft({ movementType: "ADJUSTMENT", quantity: 107 })));
    assert.equal(adjustment.stockAfter, 107); assert.equal(adjustment.quantity, 1);
    assert.equal((await InventoryBatch.findOne({ source: "LEGACY", item: item._id })).unitCost, 2);
    assert.deepEqual([await Expense.countDocuments(), await SupplierInvoice.countDocuments()], counts);
    await assert.rejects(previewStockAction({ ...actor.toObject(), role: "storekeeper" }, draft({ movementType: "ADJUSTMENT", quantity: 10 })), error => error.status === 403);
    await assert.rejects(previewStockAction({ ...actor.toObject(), role: "storekeeper" }, draft({ movementType: "STOCK_OUT", allowNegativeStock: true })), error => error.status === 403);
  });
  await t.test("full dashboard health totals do not truncate expiring items to the displayed sample", async () => {
    const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
    for (let i = 0; i < 12; i++) {
      const expiring = await InventoryItem.create({ name: `Expiring ${i}`, sku: `WSK-EXP-${i}`, category: category._id, unit: "kg", tracksExpiry: true, currentStock: 1, expiryDate: today });
      await InventoryBatch.create({ item: expiring._id, lotNumber: `EXP-${i}`, receivedQuantity: 1, remainingQuantity: 1, unitCost: 1, expiryDate: today, source: "STOCK_IN" });
    }
    const dashboard = await buildInventoryDashboard(); assert.equal(dashboard.summary.expiringSoon, 12); assert.equal(dashboard.expiring.length, 8);
    assert.equal(dashboard.summary.outOfStock, 106);
  });
  await t.test("confirmation fails closed without the unique request key index", async () => {
    const ready = await request(draft({})), before = await StockTransaction.countDocuments();
    await InventoryMovementRequest.collection.dropIndex("key_1");
    try { await assert.rejects(confirmStockAction(actor, ready), error => error.status === 503); assert.equal(await StockTransaction.countDocuments(), before); }
    finally { await InventoryMovementRequest.collection.createIndex({ key: 1 }, { unique: true }); }
  });
  await t.test("private read APIs paginate all choices/evidence and enforce existing access", async () => {
    const old = process.env.JWT_SECRET; process.env.JWT_SECRET = "owned-workspace-fixture";
    const app = express(); app.use(express.json()); app.use("/api/inventory", inventoryRoutes); app.use((error, _req, res, _next) => res.status(error.status || 400).json({ message: error.message }));
    const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    const origin = `http://127.0.0.1:${server.address().port}/api/inventory`, headers = { Authorization: `Bearer ${jwt.sign({ id: actor._id, sv: 0 }, process.env.JWT_SECRET)}` };
    try {
      const before = [await StockTransaction.countDocuments(), await AuditLog.countDocuments(), await InventoryMovementRequest.countDocuments()];
      const response = await fetch(origin + "/item-options?search=ZZ%20target", { headers }); assert.match(response.headers.get("cache-control"), /private.*no-store/);
      assert.equal((await response.json()).data[0]._id, String(item._id));
      assert.equal((await (await fetch(origin + "/item-options?page=6&limit=20", { headers })).json()).pagination.total, 119);
      for (const suffix of ["workspace", "batches?limit=1", "usage?type=preparation", "history?limit=1"]) {
        const result = await fetch(`${origin}/items/${item._id}/${suffix}`, { headers }); assert.equal(result.status, 200);
        if (suffix.startsWith("usage")) assert.equal((await result.json()).data[0].relation, "Ingredient");
      }
      assert.equal((await fetch(`${origin}/items/${item._id}/workspace`)).status, 401);
      assert.equal((await fetch(`${origin}/items/bad/workspace`, { headers })).status, 400);
      assert.deepEqual([await StockTransaction.countDocuments(), await AuditLog.countDocuments(), await InventoryMovementRequest.countDocuments()], before);
    } finally { await new Promise(resolve => server.close(resolve)); if (old === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = old; }
  });
}));
