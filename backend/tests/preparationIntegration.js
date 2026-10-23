import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import PreparationRecipe from "../models/PreparationRecipe.js";
import Production from "../models/Production.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryBatch from "../models/InventoryBatch.js";
import StockTransaction from "../models/StockTransaction.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import AddOnInventoryRecipe from "../models/AddOnInventoryRecipe.js";
import User from "../models/User.js";
import Expense from "../models/Expense.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import AuditLog from "../models/AuditLog.js";
import inventoryRoutes from "../routes/inventoryRoutes.js";
import { savePreparationRecipe, previewProduction, confirmProduction, reverseProduction, productionDetails } from "../services/preparationService.js";
import { deductOrderInventory, restoreOrderInventory } from "../services/orderInventoryService.js";
import { restoreRefundItems } from "../services/refundRestorationService.js";
import { performStockMovement, runInventoryTransaction } from "../services/inventoryStockService.js";
import { getSaleableInventory } from "../services/inventoryEligibilityService.js";
import { historicalOrderCost } from "../services/profitCostService.js";
import { buildInventoryValuation } from "../services/inventoryValuationService.js";
import { preparationYieldReport } from "../services/preparationYieldService.js";
// Owned disposable loopback replica only. No dotenv, external URI or live data.
process.env.NODE_ENV = "test"; process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "false";
test("preparation production against owned MongoDB", { timeout: 120000 }, async t => {
  await withIsolatedMongo(async () => {
    const actor = await User.create({ name: "Owned production admin", email: "production@fixture.invalid", password: "OwnedPassword123!", role: "admin" });
    const category = await InventoryCategory.create({ name: "Owned production ingredients", skuPrefix: "PRP" });
    let sequence = 0;
    const stock = options => InventoryItem.create({ name: `Owned ingredient ${++sequence}`, sku: `PRP-${sequence}`, unit: "kg", category: category._id, unitCost: 10, currentStock: 10, ...options });
    const rawA = await stock(), rawB = await stock(), finished = await stock({ name: "Owned prepared sauce", currentStock: 0, tracksExpiry: true });
    const recipeBody = { name: "Owned sauce recipe", finishedItem: String(finished._id), outputQuantity: 500, outputUnit: "g", ingredients: [{ inventoryItem: String(rawA._id), quantity: 350, unit: "g" }, { inventoryItem: String(rawB._id), quantity: 150, unit: "g" }], isActive: true, notes: "Owned instructions" };
    let recipe, first;
    const draft = (extra = {}) => ({ recipe: String(recipe._id), expectedVersion: recipe.version, multiplier: 2, actualQuantity: 980, outputUnit: "g", preparedAt: new Date(Date.now() - 60000).toISOString(), expiryDate: "2030-01-02T12:00:00+03:00", ingredients: [{ inventoryItem: String(rawA._id), quantity: 700, unit: "g" }, { inventoryItem: String(rawB._id), quantity: 300, unit: "g" }], ...extra });
    const ready = async (body = draft()) => ({ ...body, previewFingerprint: (await previewProduction(actor, body)).fingerprint, idempotencyKey: randomUUID() });
    const balance = async id => (await InventoryItem.findById(id).lean()).currentStock;
    await t.test("recipe saves and preview do not change balances, batches or stock movements", async () => {
      recipe = await savePreparationRecipe(actor, recipeBody);
      assert.equal(recipe.expectedQuantity, 0.5); assert.equal(recipe.ingredients[0].quantity, 0.35);
      const preview = await previewProduction(actor, draft()); assert.equal(preview.canConfirm, true); assert.equal(preview.actualQuantity, 0.98); assert.equal(preview.yieldDifference, -0.02); assert.equal(preview.totalCost, 10);
      assert.equal(await balance(rawA._id), 10); assert.equal(await InventoryBatch.countDocuments(), 0); assert.equal(await StockTransaction.countDocuments(), 0);
    });
    await t.test("actual yield atomically transfers original cost into the finished batch without a duplicate expense", async () => {
      const body = await ready(); first = await confirmProduction(actor, body);
      assert.match(first.productionNumber, /^PRD-\d{4}-\d{6}$/); assert.equal(await balance(rawA._id), 9.3); assert.equal(await balance(rawB._id), 9.7); assert.equal(await balance(finished._id), 0.98);
      const batch = await InventoryBatch.findById(first.finishedBatch).lean(); assert.equal(batch.remainingQuantity, 0.98); assert.equal(batch.source, "PRODUCTION"); assert.equal(first.totalCost, 10); assert.ok(Math.abs(batch.unitCost * 0.98 - 10) < 0.000001);
      assert.equal(await Expense.countDocuments(), 0); assert.equal(await SupplierInvoice.countDocuments(), 0); assert.equal(first.movements.length, 3); assert.equal(first.ingredients[0].allocations.length, 1);
      assert.equal((await buildInventoryValuation({ itemIds: [rawA._id, rawB._id, finished._id] })).summary.inventoryValue, 200, "Cost moves from raw stock into the finished batch; total value is not doubled");
      assert.equal(await StockTransaction.countDocuments({ movementType: { $in: ["WASTE", "DAMAGED"] } }), 0, "Yield difference is not another write-off");
      assert.equal((await confirmProduction(actor, body))._id.toString(), first._id.toString()); assert.equal(await balance(finished._id), 0.98);
      assert.equal(String((await confirmProduction(actor, { ...body, yieldExplanation: "" }))._id), String(first._id), "Empty new field preserves an old request's idempotent recovery");
      await assert.rejects(confirmProduction(actor, { ...body, actualQuantity: 900 }), error => error.status === 409);
      assert.equal(await AuditLog.countDocuments({ action: "PRODUCTION_CONFIRMED" }), 1);
    });
    await t.test("duplicate and concurrent confirmations post once; stale previews cannot oversell", async () => {
      const body = await ready(); const same = await Promise.all([confirmProduction(actor, body), confirmProduction(actor, body)]); assert.equal(String(same[0]._id), String(same[1]._id));
      const fresh = await ready(); const different = await Promise.allSettled([confirmProduction(actor, fresh), confirmProduction(actor, { ...fresh, idempotencyKey: randomUUID() })]);
      assert.equal(different.filter(row => row.status === "fulfilled").length, 1); assert.equal(different.filter(row => row.status === "rejected" && row.reason.status === 409).length, 1);
    });
    await t.test("insufficient and expired/quarantined ingredients block confirmation without writes", async () => {
      const counts = await Promise.all([Production.countDocuments(), StockTransaction.countDocuments()]);
      const body = draft({ ingredients: [{ inventoryItem: String(rawA._id), quantity: 100000, unit: "g" }, { inventoryItem: String(rawB._id), quantity: 300, unit: "g" }] });
      const plan = await previewProduction(actor, body); assert.equal(plan.canConfirm, false); await assert.rejects(confirmProduction(actor, { ...body, previewFingerprint: plan.fingerprint, idempotencyKey: randomUUID() }), /Insufficient usable/);
      const batches = await InventoryBatch.find({ item: rawA._id }).lean(); await InventoryBatch.updateMany({ item: rawA._id }, { $set: { expiryDate: new Date("2020-01-01"), qualityStatus: "quarantined" } });
      assert.equal((await previewProduction(actor, draft())).canConfirm, false);
      for (const batch of batches) await InventoryBatch.updateOne({ _id: batch._id }, { $set: { expiryDate: batch.expiryDate, qualityStatus: batch.qualityStatus } });
      await InventoryBatch.updateMany({ item: rawA._id }, { $unset: { unitCost: "" } });
      await assert.rejects(previewProduction(actor, draft()), /Historical input batch cost is unavailable/);
      for (const batch of batches) await InventoryBatch.updateOne({ _id: batch._id }, { $set: { unitCost: batch.unitCost } });
      assert.deepEqual(await Promise.all([Production.countDocuments(), StockTransaction.countDocuments()]), counts);
    });
    await t.test("late output failure rolls back earlier raw deductions, stock movements and audit", async () => {
      const body = await ready(), before = await Promise.all([balance(rawA._id), balance(rawB._id), StockTransaction.countDocuments(), Production.countDocuments(), AuditLog.countDocuments()]);
      const original = InventoryBatch.create;
      InventoryBatch.create = function(rows, ...rest) { if (rows.some(row => row.source === "PRODUCTION")) throw new Error("Owned output write failure"); return original.call(this, rows, ...rest); };
      try { await assert.rejects(confirmProduction(actor, body), /Owned output write failure/); } finally { InventoryBatch.create = original; }
      assert.deepEqual(await Promise.all([balance(rawA._id), balance(rawB._id), StockTransaction.countDocuments(), Production.countDocuments(), AuditLog.countDocuments()]), before);
    });
    await t.test("recipe changes retain historical snapshots and reject stale confirmation, duplicates and circular recipes", async () => {
      const old = await ready(); recipe = await savePreparationRecipe(actor, { ...recipeBody, expectedVersion: recipe.version, outputQuantity: 550, notes: "Revised instructions" }, String(recipe._id));
      assert.equal(recipe.version, 2); assert.equal((await Production.findById(first._id).lean()).recipeSnapshot.outputQuantity, 500);
      await assert.rejects(confirmProduction(actor, old), /recipe changed/);
      await assert.rejects(savePreparationRecipe(actor, { ...recipeBody, expectedVersion: recipe.version, ingredients: [recipeBody.ingredients[0], recipeBody.ingredients[0]] }, String(recipe._id)), /Duplicate ingredient/);
      const another = await stock({ currentStock: 0 });
      await savePreparationRecipe(actor, { ...recipeBody, finishedItem: String(another._id), ingredients: [{ inventoryItem: String(finished._id), quantity: 100, unit: "g" }] });
      await assert.rejects(savePreparationRecipe(actor, { ...recipeBody, finishedItem: String(rawA._id), ingredients: [{ inventoryItem: String(another._id), quantity: 100, unit: "g" }] }), /Preparation cycle/);
    });
    await t.test("inactive recipes, stale stock evidence, invalid output and unsupported conversions never post", async () => {
      const body = await ready(), count = await Production.countDocuments();
      await InventoryItem.updateOne({ _id: rawA._id }, { $inc: { stockVersion: 1 } });
      await assert.rejects(confirmProduction(actor, body), /changed since preview/);
      for (const extra of [{ actualQuantity: 0 }, { actualQuantity: -1 }, { outputUnit: "ml" }, { preparedAt: "bad date" }, { preparedAt: "2099-01-01T00:00:00Z" }, { expiryDate: null }]) await assert.rejects(previewProduction(actor, draft(extra)));
      recipe = await savePreparationRecipe(actor, { ...recipeBody, isActive: false, expectedVersion: recipe.version }, String(recipe._id));
      await assert.rejects(previewProduction(actor, draft()), /active preparation/);
      recipe = await savePreparationRecipe(actor, { ...recipeBody, expectedVersion: recipe.version }, String(recipe._id));
      assert.equal(await Production.countDocuments(), count);
    });
    await t.test("concurrent recipe edits cannot introduce a circular preparation graph", async () => {
      const a = await stock(), b = await stock();
      const body = (output, input) => ({ ...recipeBody, finishedItem: String(output._id), ingredients: [{ inventoryItem: String(input._id), quantity: 100, unit: "g" }] });
      const result = await Promise.allSettled([savePreparationRecipe(actor, body(a,b)), savePreparationRecipe(actor, body(b,a))]);
      assert.equal(result.filter(row => row.status === "fulfilled").length, 1); assert.equal(result.filter(row => row.status === "rejected").length, 1);
      await assert.rejects(savePreparationRecipe(actor, body(a,a)), /own ingredient/);
    });
    await t.test("menu and add-on consumption use prepared stock only; cancellation and partial refunds restore finished lots", async () => {
      const dish = new mongoose.Types.ObjectId(), addOn = new mongoose.Types.ObjectId();
      await InventoryRecipe.create({ menuItem: dish, updatedBy: actor._id, ingredients: [{ inventoryItem: finished._id, quantityPerSale: 0.025, unit: "kg" }] });
      await AddOnInventoryRecipe.create({ addOn, updatedBy: actor._id, ingredients: [{ inventoryItem: finished._id, quantityPerAddOn: 0.005, unit: "kg" }] });
      const catalogLines = [{ product: { _id: dish, name: "Owned burger" }, productType: "menuItem", quantity: 2, customization: { selectedAddOns: [{ addOn, name: "Owned sauce add-on", quantity: 1 }] } }];
      const orderId = new mongoose.Types.ObjectId(), rawBalance = await balance(rawA._id), before = await balance(finished._id);
      const deductions = await runInventoryTransaction(session => deductOrderInventory({ catalogLines, orderId, orderNumber: "OWNED-PRODUCTION-SALE", source: "pos", actorId: actor._id, session }));
      assert.equal(deductions.length, 1); assert.equal(String(deductions[0].item), String(finished._id)); assert.equal(deductions[0].quantity, 0.06); assert.equal(await balance(rawA._id), rawBalance); assert.ok(Math.abs(await balance(finished._id) - (before - 0.06)) < 0.000001);
      const order = { _id: orderId, orderNumber: "OWNED-PRODUCTION-SALE", items: [{ menuItem: dish, quantity: 2 }], inventoryStatus: "deducted", inventoryTransactions: deductions.map(row => row._id), inventoryRestorationTransactions: [], inventoryReturnedQuantities: {}, restoredItemQuantities: {} };
      const cost = historicalOrderCost(order, deductions.map(row => row.toObject())); assert.equal(cost.quality, "recorded"); assert.ok(cost.amount > 0);
      await runInventoryTransaction(session => restoreRefundItems({ order, items: [{ index: 0, quantity: 1 }], actor, reference: "OWNED-PARTIAL", session })); assert.ok(Math.abs(await balance(finished._id) - (before - 0.03)) < 0.000001); assert.equal(await balance(rawA._id), rawBalance);
      // Separate order to exercise the existing full cancellation restoration.
      const secondId = new mongoose.Types.ObjectId(); const second = await runInventoryTransaction(session => deductOrderInventory({ catalogLines, orderId: secondId, orderNumber: "OWNED-CANCEL", source: "website", actorId: actor._id, session }));
      const after = await balance(finished._id); await runInventoryTransaction(session => restoreOrderInventory({ transactionIds: second.map(row => row._id), orderId: secondId, orderNumber: "OWNED-CANCEL", actorId: actor._id, status: "cancelled", session })); assert.ok(Math.abs(await balance(finished._id) - (after + 0.06)) < 0.000001);
      assert.equal((await productionDetails(actor, first._id)).canReverse, false, "Even restored consumption remains a dependency");
    });
    await t.test("finished waste deducts only finished stock and actual batch history/expiry stays authoritative", async () => {
      const raw = await balance(rawA._id), before = await balance(finished._id);
      await runInventoryTransaction(session => performStockMovement({ itemId: finished._id, movementType: "WASTE", quantity: 0.05, reason: "Owned finished sauce waste", userId: actor._id }, { session }));
      assert.equal(await balance(rawA._id), raw); assert.ok(Math.abs(await balance(finished._id) - (before - 0.05)) < 0.000001);
      const details = await productionDetails(actor, first._id); assert.ok(details.activity.some(row => row.movementType === "WASTE")); assert.equal(details.remainingQuantity, (await InventoryBatch.findById(first.finishedBatch)).remainingQuantity);
      assert.equal((await getSaleableInventory(await InventoryItem.findById(finished._id), { now: new Date("2031-01-01") })).saleableStock, 0);
      await assert.rejects(reverseProduction(actor, first._id, { reason: "Owned reversal after consumption" }), /cannot be safely reversed/);
    });
    await t.test("safe reversal targets the exact untouched batch, restores original ingredients and is idempotent", async () => {
      const body = await ready(), before = await balance(rawA._id), record = await confirmProduction(actor, body);
      await assert.rejects(reverseProduction({ ...actor.toObject(), role: "storekeeper" }, record._id, { reason: "Owned permission test" }), error => error.status === 403);
      assert.equal((await productionDetails(actor, record._id)).canReverse, true);
      const originalLot = record.ingredients[0].allocations[0];
      await InventoryBatch.updateOne({ _id: originalLot.batch }, { $set: { unitCost: 999 } });
      assert.equal((await productionDetails(actor, record._id)).canReverse, false);
      await assert.rejects(reverseProduction(actor, record._id, { reason: "Owned changed cost correction" }), /batch cost, expiry or quantity evidence/);
      await InventoryBatch.updateOne({ _id: originalLot.batch }, { $set: { unitCost: originalLot.unitCost } });
      await InventoryBatch.updateOne({ _id: record.finishedBatch }, { $set: { unitCost: 999 } });
      await assert.rejects(reverseProduction(actor, record._id, { reason: "Owned changed output cost correction" }), /Finished batch cost/);
      await InventoryBatch.updateOne({ _id: record.finishedBatch }, { $set: { unitCost: record.unitCost } });
      await reverseProduction(actor, record._id, { reason: "Owned test batch correction" });
      assert.ok(Math.abs(await balance(rawA._id) - before) < 0.000001); assert.equal((await InventoryBatch.findById(record.finishedBatch)).remainingQuantity, 0);
      const count = await StockTransaction.countDocuments(); await reverseProduction(actor, record._id, { reason: "Same correction retried" }); assert.equal(await StockTransaction.countDocuments(), count);
      assert.equal(await AuditLog.countDocuments({ action: "PRODUCTION_REVERSED", entityId: record._id }), 1);
    });
    await t.test("HTTP permissions, filters, real history totals and private headers", async () => {
      const previous = process.env.JWT_SECRET; process.env.JWT_SECRET = "owned-production-http-fixture";
      const app = express(); app.use(express.json()); app.use("/api/inventory", inventoryRoutes); app.use((error, _req, res, _next) => res.status(error.status || 400).json({ success: false, message: error.message }));
      const server = await new Promise(resolve => { const handle = app.listen(0, "127.0.0.1", () => resolve(handle)); });
      try {
        for (const role of ["admin", "storekeeper", "accountant", "cashier"]) {
          const user = role === "admin" ? actor : await User.create({ name: "Owned HTTP user", email: `${role}@fixture.invalid`, password: "OwnedPassword123!", role });
          const headers = { Authorization: `Bearer ${jwt.sign({ id: user._id, sv: 0 }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" };
          const origin = `http://127.0.0.1:${server.address().port}/api/inventory`;
          if (role === "admin") {
            const before = await PreparationRecipe.countDocuments();
            const invalid = await fetch(origin + "/preparation-recipes", { method: "POST", headers, body: JSON.stringify({ ...recipeBody, finishedItem: String(rawA._id), ingredients: [{ inventoryItem: String(finished._id), quantity: 100, unit: "g" }] }) });
            assert.equal(invalid.status, 400); assert.match((await invalid.json()).message, /Preparation cycle/);
            assert.equal(await PreparationRecipe.countDocuments(), before, "Direct API calls cannot bypass cycle validation");
          }
          const read = await fetch(origin + "/production?status=completed&search=PRD", { headers }); assert.equal(read.status, role === "cashier" ? 403 : 200);
          const report = await fetch(origin + "/production/yield-report?period=week&limit=1", { headers });
          assert.equal(report.status, role === "cashier" ? 403 : 200);
          if (report.ok) { assert.match(report.headers.get("cache-control"), /private.*no-store/); const json = await report.json(); assert.equal(json.data.length, 1); assert.equal(json.pagination.total, await Production.countDocuments()); }
          if (read.ok) { assert.match(read.headers.get("cache-control"), /private.*no-store/); const json = await read.json(); assert.ok(json.data.every(row => row.status === "completed")); assert.equal(json.pagination.total, await Production.countDocuments({ status: "completed" })); }
          if (["accountant", "cashier"].includes(role)) assert.equal((await fetch(origin + "/production/confirm", { method: "POST", headers, body: "{}" })).status, 403);
        }
      } finally { await new Promise(resolve => server.close(resolve)); if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; }
    });
    await t.test("yield report uses immutable actual inputs, excludes reversed batches across pages and never posts waste/cost", async () => {
      const tomato = await stock({ unit: "g", currentStock: 10000, unitCost: 0.01 });
      const sliced = await stock({ unit: "g", currentStock: 0, unitCost: 0 });
      const definition = { name: "Owned sliced tomato", isActive: true, finishedItem: String(sliced._id), outputQuantity: 900, outputUnit: "g", ingredients: [{ inventoryItem: String(tomato._id), quantity: 1000, unit: "g" }] };
      let tomatoRecipe = await savePreparationRecipe(actor, definition);
      const body = { recipe: String(tomatoRecipe._id), expectedVersion: tomatoRecipe.version, multiplier: 1, actualQuantity: 850, outputUnit: "g", preparedAt: new Date(Date.now() - 60000).toISOString(), ingredients: [{ inventoryItem: String(tomato._id), quantity: 1000, unit: "g" }], yieldExplanation: "Extra trimming of damaged tomato" };
      const before = await StockTransaction.countDocuments();
      const preview = await previewProduction(actor, body);
      assert.equal(preview.yield.lossQuantity, 150); assert.equal(preview.yield.outputShortfallQuantity, 50);
      assert.equal(await StockTransaction.countDocuments(), before);
      const request = { ...body, previewFingerprint: preview.fingerprint, idempotencyKey: randomUUID() };
      await assert.rejects(confirmProduction(actor, { ...request, yieldExplanation: "Changed after review" }), error => error.status === 409);
      await assert.rejects(previewProduction(actor, { ...body, yieldExplanation: "x".repeat(501) }), /Yield explanation is too long/);
      const record = await confirmProduction(actor, request);
      assert.equal(await StockTransaction.countDocuments(), before + 2, "Only raw deduction and finished output are posted");
      assert.equal(await balance(tomato._id), 9000); assert.equal(await balance(sliced._id), 850);
      assert.equal(record.yieldExplanation, body.yieldExplanation); assert.equal(record.totalCost, 10);
      assert.equal(String((await confirmProduction(actor, request))._id), String(record._id));
      await assert.rejects(confirmProduction(actor, { ...request, yieldExplanation: "Changed after confirmation" }), error => error.status === 409);
      await Production.updateOne({ _id: record._id }, { $set: { yieldExplanation: "Overwritten" } });
      assert.equal((await Production.findById(record._id)).yieldExplanation, body.yieldExplanation);

      tomatoRecipe = await savePreparationRecipe(actor, { ...definition, expectedVersion: tomatoRecipe.version, outputQuantity: 800 }, String(tomatoRecipe._id));
      const other = { ...body, expectedVersion: tomatoRecipe.version, actualQuantity: 700, yieldExplanation: "Owned second batch" };
      const second = await confirmProduction(actor, { ...other, previewFingerprint: (await previewProduction(actor, other)).fingerprint, idempotencyKey: randomUUID() });
      await reverseProduction(actor, second._id, { reason: "Owned correction before use" });
      await InventoryItem.updateOne({ _id: tomato._id }, { $set: { unitCost: 99 } });
      const counts = await Promise.all([StockTransaction.countDocuments(), Expense.countDocuments(), SupplierInvoice.countDocuments(), AuditLog.countDocuments()]);
      const details = await productionDetails(actor, record._id);
      assert.equal(details.yield.expectedOutputQuantity, 900); assert.equal(details.yield.lossQuantity, 150); assert.equal(details.totalCost, 10);
      const query = { period: "week", recipe: String(tomatoRecipe._id), limit: 1 };
      const report = await preparationYieldReport(actor, query);
      assert.equal(report.data.length, 1); assert.equal(report.pagination.total, 2); assert.equal(report.pagination.pages, 2);
      assert.deepEqual(report.coverage, { completed: 1, excludedReversed: 1, unavailable: 0 });
      assert.equal(report.summary[0].actualInputQuantity, 1000); assert.equal(report.summary[0].actualOutputQuantity, 850);
      assert.equal(report.summary[0].lossQuantity, 150); assert.equal(report.summary[0].outputShortfallQuantity, 50);
      const page2 = await preparationYieldReport(actor, { ...query, page: 2 });
      assert.notEqual(String(page2.data[0]._id), String(report.data[0]._id)); assert.deepEqual(page2.summary, report.summary);
      assert.equal(page2.data.find(row => String(row._id) === String(record._id))?.yieldExplanation || report.data.find(row => String(row._id) === String(record._id))?.yieldExplanation, body.yieldExplanation);
      await assert.rejects(preparationYieldReport(actor, { period: "custom", from: "2026-10-23", to: "2026-10-22" }), /From date/);
      await assert.rejects(preparationYieldReport(actor, { recipe: "bad" }), /Invalid preparation recipe/);
      assert.deepEqual(await Promise.all([StockTransaction.countDocuments(), Expense.countDocuments(), SupplierInvoice.countDocuments(), AuditLog.countDocuments()]), counts, "Report/detail reads do not change stock, cost or audit history");
    });
    await t.test("mixed mass/volume production remains valid but has unknown physical loss, never fabricated zero", async () => {
      const mass = await stock({ unit: "g", currentStock: 5000 }), volume = await stock({ unit: "ml", currentStock: 5000 });
      const output = await stock({ unit: "g", currentStock: 0 });
      const recipe = await savePreparationRecipe(actor, { name: "Owned mixed basis", isActive: true, finishedItem: String(output._id), outputQuantity: 900, outputUnit: "g", ingredients: [{ inventoryItem: String(mass._id), quantity: 500, unit: "g" }, { inventoryItem: String(volume._id), quantity: 500, unit: "ml" }] });
      const body = { recipe: String(recipe._id), expectedVersion: recipe.version, multiplier: 1, actualQuantity: 850, outputUnit: "g", preparedAt: new Date(Date.now() - 60000).toISOString(), ingredients: recipe.ingredients.map(line => ({ inventoryItem: String(line.inventoryItem), quantity: line.enteredQuantity, unit: line.enteredUnit })) };
      const preview = await previewProduction(actor, body); assert.equal(preview.yield.lossQuantity, null); assert.equal(preview.canConfirm, true);
      await confirmProduction(actor, { ...body, previewFingerprint: preview.fingerprint, idempotencyKey: randomUUID() });
      const report = await preparationYieldReport(actor, { period: "week", recipe: String(recipe._id) });
      assert.equal(report.coverage.unavailable, 1); assert.equal(report.summary[0].lossQuantity, null);
      assert.equal(report.summary[0].outputShortfallQuantity, 50); assert.match(report.data[0].yield.unavailableReason, /mass or volume/);
      assert.equal(report.data[0].yieldExplanation, "", "Old/optional missing explanations are not invented");
    });
    assert.ok(await PreparationRecipe.countDocuments());
  });
});
