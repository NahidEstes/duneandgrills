import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import RecipeInstruction from "../models/RecipeInstruction.js";
import Revision from "../models/RecipeInstructionRevision.js";
import Trial from "../models/RecipeInstructionTrial.js";
import AuditLog from "../models/AuditLog.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryBatch from "../models/InventoryBatch.js";
import StockTransaction from "../models/StockTransaction.js";
import Expense from "../models/Expense.js";
import CashMovement from "../models/CashMovement.js";
import Order from "../models/Order.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import kitchenRoutes from "../routes/kitchenRoutes.js";
import { pilotByCode } from "../data/recipeInstructionPilot.js";
import { saveRecipeInstruction, getRecipeInstruction, listRecipeInstructions } from "../services/recipeInstructionService.js";
import { recordRecipeTrial, recipeLifecycle, recipeHistory, recipeTrials } from "../services/recipeInstructionWorkflowService.js";
import { CHECKS } from "../services/recipeInstructionRules.js";
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "recipe-workflow-isolated-only";
const checks = Object.fromEntries(CHECKS.map(key => [key, true]));
const rejected = (work, status, pattern) => assert.rejects(work, error => error.status === status && (!pattern || pattern.test(error.message)));
test("Recipe Instructions Phase 3 isolated lifecycle", { timeout: 180000 }, async t => {
  await withIsolatedMongo(async () => {
    const actors = {};
    for (const role of ["admin", "manager", "kitchen", "cashier", "customer"]) actors[role] = await User.create({ name: `Trial ${role}`, email: `trial-${role}@test.local`, password: "TestPassword123!", role });
    const admin = actors.admin, kitchen = actors.kitchen;
    const category = await InventoryCategory.create({ name: "Isolated recipe trial stock", skuPrefix: "TRIAL" });
    const item = await InventoryItem.create({ name: "Untouched ingredient", sku: "TEST-TRIAL-001", category: category._id, unit: "kg", currentStock: 5, unitCost: 8 });
    const batch = await InventoryBatch.create({ item: item._id, lotNumber: "TEST-TRIAL-LOT", receivedQuantity: 5, remainingQuantity: 5, unitCost: 8, source: "STOCK_IN" });
    const itemBefore = item.toObject(), batchBefore = batch.toObject();
    const latest = code => getRecipeInstruction(code, admin);
    const save = async (code, options = {}) => { const row = await latest(code); return saveRecipeInstruction(code, { revision: row.revision, workflowVersion: row.workflowVersion || 0, status: "draft", reviewNotes: "", inventoryRecipe: null, ...options }, admin); };
    const actionPayload = async (code, options = {}) => { const row = await latest(code); return { revision: row.revision, workflowVersion: row.workflowVersion || 0, requestKey: randomUUID(), reason: "Isolated qualified review", ...options }; };
    const action = async (code, name, options) => recipeLifecycle(code, name, await actionPayload(code, options), admin);
    const trialPayload = async (code, options = {}) => { const row = await latest(code); return { revision: row.revision, requestKey: randomUUID(), trialAt: new Date().toISOString(), batch: { value: row.category === "Main Recipes" ? 10 : 500, unit: row.category === "Main Recipes" ? "servings" : "g", basis: "measured" }, ingredients: row.ingredients.map((_, index) => ({ index, quantity: 10, brand: "Test real brand" })), usableYield: { value: 300, unit: "g", basis: "measured" }, waste: null, preparation: "Actual preparation observations", cooking: "Actual cooking measurements recorded", deviations: "None", taste: { tested: true, score: 4, notes: "Measured panel score" }, texture: { tested: true, score: 4, notes: "Tested" }, portionConsistency: { tested: true, score: 4, notes: "Tested" }, presentation: { tested: true, score: 4, notes: "Tested" }, delivery: [], safety: "passed", outcome: "passed", reviewerComments: "Isolated fixture, not production approval", ...options }; };
    const passed = async code => recordRecipeTrial(code, await trialPayload(code), kitchen);
    await t.test("draft hidden, trial view explicit, no approval/publication bypass", async () => {
      await save("HB01"); assert.deepEqual(await listRecipeInstructions(kitchen), []); assert.deepEqual(await listRecipeInstructions(kitchen, "trial"), []);
      await rejected(() => action("HB01", "publish"), 409);
      await rejected(async () => recordRecipeTrial("HB01", await trialPayload("HB01"), kitchen), 409);
      await rejected(() => saveRecipeInstruction("HB01", { revision: 1, status: "approved", reviewNotes: "" }, admin), 400);
      const payload = await actionPayload("HB01"); await recipeLifecycle("HB01", "submit", payload, admin); await recipeLifecycle("HB01", "submit", payload, admin);
      assert.equal((await listRecipeInstructions(kitchen, "trial"))[0].code, "HB01"); assert.deepEqual(await listRecipeInstructions(kitchen), []);
    });
    await t.test("missing/failed/untested trials cannot approve; checklist and role enforced", async () => {
      await rejected(() => action("HB01", "approve", { trialId: "012345678901234567890123", checklist: checks }), 400);
      const failed = await recordRecipeTrial("HB01", await trialPayload("HB01", { outcome: "failed" }), kitchen);
      await rejected(() => action("HB01", "approve", { trialId: failed.id, checklist: checks }), 400);
      const unknown = await recordRecipeTrial("HB01", await trialPayload("HB01", { usableYield: { value: 300, unit: "g", basis: "estimated" } }), kitchen);
      await rejected(() => action("HB01", "approve", { trialId: unknown.id, checklist: checks }), 400);
      const trial = await passed("HB01");
      await rejected(() => action("HB01", "approve", { trialId: trial.id, checklist: { ...checks, storage: false } }), 400);
      await rejected(async () => recipeLifecycle("HB01", "approve", await actionPayload("HB01", { trialId: trial.id, checklist: checks }), kitchen), 403);
      const payload = await actionPayload("HB01", { trialId: trial.id, checklist: checks });
      await recipeLifecycle("HB01", "approve", payload, admin); await recipeLifecycle("HB01", "approve", payload, admin);
      assert.deepEqual(await listRecipeInstructions(kitchen), []); assert.equal((await latest("HB01")).status, "approved");
    });
    await t.test("concurrent publication has one pointer and one audit; retry returns original", async () => {
      const first = await actionPayload("HB01"), second = { ...first, requestKey: randomUUID() };
      const outcomes = await Promise.allSettled([recipeLifecycle("HB01", "publish", first, admin), recipeLifecycle("HB01", "publish", second, admin)]);
      assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1); assert.equal(outcomes.find(r => r.status === "rejected").reason.status, 409);
      const key = outcomes[0].status === "fulfilled" ? first : second;
      await recipeLifecycle("HB01", "publish", key, admin);
      assert.equal((await listRecipeInstructions(kitchen))[0].status, "published"); assert.equal(await AuditLog.countDocuments({ action: "RECIPE_INSTRUCTION_PUBLISH", entityLabel: "HB01 · r1" }), 1);
      await rejected(() => recipeLifecycle("HB01", "publish", { ...key, reason: "Different submission" }, admin), 409);
    });
    await t.test("trial requests idempotent, no financial/photo payload, ingredient measurements honest", async () => {
      await save("T1", { status: "trial_required" });
      const payload = await trialPayload("T1", { outcome: "needs_changes", ingredients: pilotByCode("T1").ingredients.map((_, index) => ({ index, quantity: null })), taste: { tested: false, score: null, notes: "Not tested" }, usableYield: null });
      const pair = await Promise.allSettled([recordRecipeTrial("T1", payload, kitchen), recordRecipeTrial("T1", payload, kitchen)]);
      assert.ok(pair.some(r => r.status === "fulfilled")); const retry = await recordRecipeTrial("T1", payload, kitchen); assert.equal(await Trial.countDocuments({ code: "T1", requestKey: payload.requestKey }), 1);
      assert.equal(retry.record.ingredients[0].basis, "untested"); assert.equal(retry.record.usableYield, null); assert.deepEqual(retry.record.delivery, []);
      await rejected(() => recordRecipeTrial("T1", { ...payload, requestKey: randomUUID(), cost: 20 }, kitchen), 400);
      await rejected(() => recordRecipeTrial("T1", { ...payload, outcome: "passed" }, kitchen), 409);
      const trial = await passed("T1"); await action("T1", "approve", { trialId: trial.id, checklist: checks }); await action("T1", "publish");
    });
    await t.test("dish needs 10-serving trial, current exact published dependencies", async () => {
      await save("B01", { status: "trial_required" });
      const small = await recordRecipeTrial("B01", await trialPayload("B01", { batch: { value: 1, unit: "servings", basis: "measured" } }), kitchen);
      await rejected(() => action("B01", "approve", { trialId: small.id, checklist: checks }), 400);
      const trial = await passed("B01"); await action("B01", "approve", { trialId: trial.id, checklist: checks }); await action("B01", "publish");
      assert.deepEqual((await latest("B01")).dependencyPins.map(p => ({ code: p.code, revision: p.revision })), [{ code: "HB01", revision: 1 }, { code: "T1", revision: 1 }]);
    });
    await t.test("material edits make new unapproved revision, published recipe and previous approval immutable", async () => {
      const before = await getRecipeInstruction("S1", kitchen);
      const row = await latest("HB01"), content = { ingredients: row.ingredients.map((r, i) => ({ ...r, quantities: i ? r.quantities : [301, 602] })) };
      const payload = { revision: row.revision, workflowVersion: row.workflowVersion, status: "draft", reviewNotes: "New formula", inventoryRecipe: null, content, reason: "Measured recipe adjustment", requestKey: randomUUID() };
      const changed = await saveRecipeInstruction("S1", payload, admin); assert.equal(changed.revision, 2); assert.equal(changed.status, "draft"); assert.equal(changed.approval, undefined);
      const retry = await saveRecipeInstruction("HB01", payload, admin); assert.equal(retry.revision, 2);
      assert.deepEqual(await getRecipeInstruction("S1", kitchen), { ...before, workflowVersion: retry.workflowVersion, currentWorking: false });
      assert.equal((await Revision.findOne({ code: "HB01", revision: 1 })).approval.actor.name, admin.name);
      await rejected(() => action("HB01", "publish"), 409);
      await action("HB01", "submit"); const trial = await passed("HB01"); await action("HB01", "approve", { trialId: trial.id, checklist: checks }); await action("HB01", "publish");
      const dish = (await listRecipeInstructions(kitchen)).find(r => r.code === "B01"); assert.equal(dish.dependencyPins[0].revision, 1); assert.equal(dish.dependencyPins[0].updateAvailable, true);
      assert.equal((await getRecipeInstruction("HB01", kitchen, { revision: "1" })).ingredients[0].quantities[0], 300);
    });
    await t.test("restore creates new draft; alias/history/diffs retained and no approval transfer", async () => {
      const restored = await save("HB01", { restoreRevision: 1, reason: "Revisit original formula", requestKey: randomUUID() }); assert.equal(restored.revision, 3); assert.equal(restored.status, "draft"); assert.equal(restored.ingredients[0].quantities[0], 300);
      const history = await recipeHistory("S1", admin); assert.equal(history.rows.length, 3); assert.equal(history.rows[0].restoredFrom, 1); assert.ok(history.rows[1].changes.some(c => c.field === "ingredients"));
      assert.equal((await getRecipeInstruction("S1", kitchen)).revision, 2); await rejected(() => getRecipeInstruction("S1", kitchen, { revision: "3" }), 404);
      assert.ok((await recipeHistory("S1", kitchen)).rows.every(r => r.status === "published" && r.changes.length === 0));
      assert.equal((await getRecipeInstruction("S1", admin, { view: "published" })).revision, 2);
    });
    await t.test("missing dependencies/cycles rejected; published dependencies mandatory", async () => {
      await rejected(() => save("T1", { content: { linkedPreparationCodes: ["UNKNOWN-PREP"] }, reason: "Missing preparation", requestKey: randomUUID() }), 400);
      await rejected(() => save("T1", { content: { linkedPreparationCodes: ["B01"] }, reason: "Cycle", requestKey: randomUUID() }), 400);
      // Remove current published pointer only in isolated data, then verify approval block and restore fixture.
      await RecipeInstruction.updateOne({ code: "T1" }, { $set: { publishedRevision: null } });
      await save("B01", { status: "trial_required" }); const trial = await passed("B01");
      await rejected(() => action("B01", "approve", { trialId: trial.id, checklist: checks }), 400, /T1/);
      await RecipeInstruction.updateOne({ code: "T1" }, { $set: { publishedRevision: 1 } });
    });
    await t.test("stale review rejected, audit failure rolls back workflow and trial atomically", async () => {
      const trial = await passed("B01"), stale = await actionPayload("B01", { trialId: trial.id, checklist: checks }); await passed("B01");
      await rejected(() => recipeLifecycle("B01", "approve", stale, admin), 409);
      const before = (await RecipeInstruction.findOne({ code: "B01" })).workflowVersion, count = await Trial.countDocuments();
      const original = AuditLog.create; AuditLog.create = async () => { throw new Error("Injected audit failure"); };
      try { await assert.rejects(() => action("B01", "approve", { trialId: trial.id, checklist: checks }), /Injected/); await assert.rejects(() => passed("B01"), /Injected/); }
      finally { AuditLog.create = original; }
      assert.equal((await latest("B01")).status, "trial_required"); assert.equal((await RecipeInstruction.findOne({ code: "B01" })).workflowVersion, before); assert.equal(await Trial.countDocuments(), count);
    });
    await t.test("new revision cannot use a historical qualifying trial; concurrent approvals serialize", async () => {
      const old = await Trial.findOne({ code: "HB01", revision: 1, "record.outcome": "passed" });
      await action("HB01", "submit");
      await rejected(() => action("HB01", "approve", { trialId: String(old._id), checklist: checks }), 400);
      const trial = await passed("HB01"), first = await actionPayload("HB01", { trialId: trial.id, checklist: checks });
      const results = await Promise.allSettled([recipeLifecycle("HB01", "approve", first, admin), recipeLifecycle("HB01", "approve", { ...first, requestKey: randomUUID() }, admin)]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(results.find(r => r.status === "rejected").reason.status, 409);
      assert.equal(await AuditLog.countDocuments({ action: "RECIPE_INSTRUCTION_APPROVE", entityLabel: "HB01 · r3" }), 1);
    });
    await t.test("bounded trial pagination never skips equal timestamp records", async () => {
      const record = (await Trial.findOne({ code: "B01" })).record, createdAt = new Date("2026-01-01T12:00:00Z");
      await Trial.insertMany(Array.from({ length: 55 }, () => ({ code: "B01", revision: 2, requestKey: randomUUID(), requestHash: "isolated-fixture", record, actor: { id: String(kitchen._id), name: kitchen.name, role: kitchen.role }, createdAt })));
      const first = await recipeTrials("B01", admin, { revision: "2" }); assert.equal(first.rows.length, 50); assert.ok(first.nextBefore);
      const second = await recipeTrials("B01", admin, { revision: "2", before: first.nextBefore }); assert.equal(second.nextBefore, null);
      const ids = [...first.rows, ...second.rows].map(r => r.id); assert.equal(new Set(ids).size, ids.length); assert.equal(ids.length, await Trial.countDocuments({ code: "B01", revision: 2 }));
    });
    await t.test("HTTP authorization, narrow Kitchen payload, no public source or financial data", async () => {
      const app = express(); app.use(express.json()); app.use("/recipes", kitchenRoutes); app.use((err, req, res, next) => res.status(err.status || 500).json({ message: err.message }));
      const server = app.listen(0, "127.0.0.1"); await new Promise(r => server.once("listening", r));
      try {
        const request = async (role, suffix, body) => { const response = await fetch(`http://127.0.0.1:${server.address().port}/recipes/recipes${suffix}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${jwt.sign({ id: actors[role]._id }, process.env.JWT_SECRET)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, body: await response.json() }; };
        for (const role of [null, "cashier", "customer"]) assert.equal((await request(role, "")).status, role ? 403 : 401);
        const published = await request("kitchen", ""); assert.equal(published.status, 200); assert.ok(published.body.data.every(r => r.status === "published")); assert.doesNotMatch(JSON.stringify(published.body), /costPer|profit|requestHash|password|token|phone/);
        assert.equal((await request("kitchen", "/B01/workflow/approve", {})).status, 403);
        assert.equal((await request("kitchen", "/HB01?revision=3")).status, 404);
        assert.equal(published.body.data.some(r => Object.hasOwn(r, "reviewNotes")), false);
        assert.equal((await request("kitchen", "/B01?view=trial")).status, 200);
      } finally { await new Promise(r => server.close(r)); }
    });
    await t.test("all lifecycle/history/trials leave nonempty stock and financial/purchasing collections unchanged", async () => {
      assert.deepEqual(await InventoryItem.findById(item._id).lean(), itemBefore); assert.deepEqual(await InventoryBatch.findById(batch._id).lean(), batchBefore);
      for (const model of [StockTransaction, Expense, CashMovement, Order, PurchaseOrder, SupplierInvoice]) assert.equal(await model.countDocuments(), 0, `${model.modelName} must remain untouched`);
    });
    await t.test("real preparation cycle and concurrent edit/approval are blocked atomically", async () => {
      await save("HB01", { content: { linkedPreparationCodes: ["T1"] }, reason: "Isolated dependency change", requestKey: randomUUID() });
      await rejected(() => save("T1", { content: { linkedPreparationCodes: ["HB01"] }, reason: "Isolated circular dependency", requestKey: randomUUID() }), 400, /Circular/);
      const trial = await passed("B01"), current = await latest("B01");
      const approval = await actionPayload("B01", { trialId: trial.id, checklist: checks });
      const edit = { revision: current.revision, workflowVersion: current.workflowVersion, status: "draft", reviewNotes: "Race fixture", inventoryRecipe: null, content: { description: "Isolated revision race" }, reason: "Test edit race", requestKey: randomUUID() };
      const results = await Promise.allSettled([recipeLifecycle("B01", "approve", approval, admin), saveRecipeInstruction("B01", edit, admin)]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(results.find(r => r.status === "rejected").reason.status, 409);
      assert.equal((await getRecipeInstruction("B01", kitchen)).revision, 1);
    });
  });
});
test("Phase 2 existing draft is preserved lazily without GET seeding or migration", { timeout: 180000 }, async () => {
  await withIsolatedMongo(async () => {
    const actor = await User.create({ name: "Legacy author", role: "admin", email: "legacy-recipe@test.local", password: "TestPassword123!" });
    await RecipeInstruction.create({ ...pilotByCode("T1"), revision: 7, status: "draft", createdBy: actor._id, updatedBy: actor._id });
    assert.equal((await getRecipeInstruction("T1", actor, { revision: "7" })).revision, 7);
    assert.equal((await recipeHistory("T1", actor)).rows[0].revision, 7); assert.equal(await Revision.countDocuments(), 0);
    const saved = await saveRecipeInstruction("T1", { revision: 7, status: "draft", reviewNotes: "Continue legacy review", inventoryRecipe: null }, actor);
    assert.equal(saved.revision, 8); assert.equal(await Revision.countDocuments(), 2);
    const old = await Revision.findOne({ code: "T1", revision: 7 }); assert.deepEqual(old.content.ingredients, pilotByCode("T1").ingredients); assert.equal(old.status, "draft"); assert.equal(old.createdActor.id, String(actor._id));
  });
});
