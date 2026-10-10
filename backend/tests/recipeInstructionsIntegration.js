import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import kitchenRoutes from "../routes/kitchenRoutes.js";
import User from "../models/User.js";
import MenuItem from "../models/MenuItem.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryBatch from "../models/InventoryBatch.js";
import StockTransaction from "../models/StockTransaction.js";
import Order from "../models/Order.js";
import AuditLog from "../models/AuditLog.js";
import RecipeInstruction from "../models/RecipeInstruction.js";
import { canonicalRecipeCode, pilotByCode, RECIPE_PILOT, RECIPE_LIBRARY } from "../data/recipeInstructionPilot.js";
import { serializeInstruction } from "../services/recipeInstructionService.js";

// NO dotenv or configured Mongo URI: all records belong to helper-owned disposable replica set.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "isolated-recipe-instruction-test-only";

test("Recipe Instructions Phase 1 + 2 (isolated replica set)", { timeout: 180000 }, async t => {
  await withIsolatedMongo(async () => {
    const users = {};
    for (const role of ["admin", "manager", "kitchen", "cashier", "customer", "inventory", "accountant"]) users[role] = await User.create({ name: `Recipe ${role}`, email: `recipe-${role}@test.local`, role, password: "TestPassword123!" });
    const dish = await MenuItem.create({ name: "Uncertain burger name — explicit mapping only", price: 21, image: "/fixture.jpg", description: "Isolated fixture", category: "Food" });
    const inventoryCategory = await InventoryCategory.create({ name: "Test only", skuPrefix: "TEST" });
    const ingredient = await InventoryItem.create({ name: "Test raw ingredient", sku: "TEST-RECIPE-01", category: inventoryCategory._id, unit: "kg", currentStock: 2, unitCost: 4 });
    const batch = await InventoryBatch.create({ item: ingredient._id, lotNumber: "TEST-RECIPE-BATCH", receivedQuantity: 2, remainingQuantity: 2, unitCost: 4, source: "STOCK_IN" });
    const inventory = await InventoryRecipe.create({ menuItem: dish._id, updatedBy: users.admin._id, ingredients: [{ inventoryItem: ingredient._id, quantityPerSale: .16, unit: "kg" }] });
    const stockBefore = await InventoryItem.findById(ingredient._id).lean(), batchBefore = await InventoryBatch.findById(batch._id).lean(), inventoryBefore = await InventoryRecipe.findById(inventory._id).lean();
    const app = express(); app.use(express.json()); app.use("/api/kitchen", kitchenRoutes);
    app.use((error, req, res, next) => res.status(error.status || 500).json({ success: false, message: error.message }));
    const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/kitchen/recipes`;
    const request = async (suffix = "", role = "admin", body) => {
      const token = role ? jwt.sign({ id: users[role]._id }, process.env.JWT_SECRET) : null;
      const response = await fetch(url + suffix, { method: body ? "PUT" : "GET", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
    };
    const draft = options => ({ revision: 0, status: "trial_required", reviewNotes: "Owner trial pending", inventoryRecipe: null, ...options });
    try {
      await t.test("no public/customer/cashier/inventory/accountant access; kitchen cannot see any pilot draft", async () => {
        assert.equal((await request("", null)).status, 401);
        for (const role of ["customer", "cashier", "inventory", "accountant"]) assert.equal((await request("", role)).status, 403);
        assert.deepEqual((await request("", "kitchen")).body.data, []);
        for (const path of ["/B01", "/S1"]) assert.equal((await request(path, "kitchen")).status, 404);
        for (const path of ["/manual", "/inventory-options"]) assert.equal((await request(path, "kitchen")).status, 403);
        assert.equal((await request("/B01", "kitchen", draft())).status, 403);
      });
      await t.test("Admin/Manager can review; reading preview never seeds database; no-store", async () => {
        for (const role of ["admin", "manager"]) {
          const response = await request("", role); assert.equal(response.status, 200); assert.equal(response.body.data.length, RECIPE_LIBRARY.length);
          assert.match(response.cache, /private, no-store/); assert.equal(response.body.data[0].persisted, false);
        }
        assert.equal(await RecipeInstruction.countDocuments(), 0);
      });
      await t.test("B01 manual p6 decimals, raw/prepared weights, count and default sauce retained", () => {
        const recipe = pilotByCode("B01");
        assert.deepEqual(recipe.ingredients.map(row => row.quantities), [[160, 1600], [1.6, 16], [.3, 3], [80, 800], [30, 300], [25, 250], [15, 150], [20, 200], [5, 50]]);
        assert.equal(recipe.ingredients[0].basis, "raw, trimmed"); assert.equal(recipe.ingredients[7].basis, "prepared");
        assert.deepEqual(recipe.ingredients[4].counts, ["2 slices × 15 g", "20 slices"]);
        assert.deepEqual(recipe.linkedPreparationCodes, ["HB01", "T1"]);
        assert.ok(recipe.source.pages.includes(6)); assert.match(recipe.cooking.join(" "), /72°C/);
        assert.match(recipe.assembly[0], /15 g S1.*10 g S1/);
      });
      await t.test("S1 and HB01 alias same formula, verified 500g/1kg quantities and loss disclaimer", async () => {
        assert.equal(canonicalRecipeCode("s1"), "HB01"); assert.deepEqual(pilotByCode("S1"), pilotByCode("HB01"));
        const sauce = pilotByCode("HB01");
        assert.deepEqual(sauce.ingredients.map(row => row.quantities), [[300, 600], [80, 160], [50, 100], [50, 100], [10, 20], [5, 10], [3, 6], [2, 4]]);
        assert.deepEqual(sauce.source.pages, [3, 4, 11, 15, 16, 19]); assert.match(sauce.yieldNotes[0], /BEFORE bowl and bottle losses/);
        assert.deepEqual((await request("/S1")).body.data, (await request("/HB01")).body.data);
        assert.equal((await request("/HB02")).status, 200); // Phase 4 optional variant, not a default substitution.
      });
      await t.test("T1 original batch only, actual manual estimated—not measured—yield and source controls", () => {
        const onion = pilotByCode("T1");
        assert.equal(onion.presets.length, 1); assert.deepEqual(onion.ingredients.map(row => row.quantities), [[500], [20], [3], [50]]);
        assert.match(onion.yieldNotes[0], /250–300 g.*NOT guaranteed or measured/);
        assert.match(onion.cooking.join(" "), /140–160°C.*20–30 minutes/);
        assert.match(onion.storage.join(" "), /57°C to 21°C within 2 hours.*6 hours total.*74°C for 15 seconds/);
        assert.deepEqual(onion.source.pages, [3, 5, 11]);
      });
      await t.test("all pilot warnings, missing photo/mapping and private manual unavailable state honest", async () => {
        for (const row of RECIPE_PILOT) {
          assert.equal(row.status, "trial_required"); assert.equal(row.servingPhoto, null); assert.equal(row.inventoryRecipe, null);
          assert.match(row.warnings[0], /NOT approved.*not validated shelf lives/);
        }
        const response = await request("/manual"); assert.equal(response.body.data.available, false);
        assert.match(response.body.data.message, /Private manual storage is not configured/);
        assert.doesNotMatch(JSON.stringify(response.body), /C:\\|file:\/\/|https?:\/\//);
      });
      await t.test("authorized explicit inventory selector returns no costs, limits or financial data", async () => {
        const response = await request("/inventory-options?search=uncertain"); assert.equal(response.status, 200);
        assert.deepEqual(Object.keys(response.body.data[0]).sort(), ["_id", "doNotTrack", "isActive", "name"]);
        assert.equal(response.body.data[0]._id, String(inventory._id));
        assert.deepEqual((await request("/inventory-options?search=no-such-dish")).body.data, []);
        assert.equal((await request(`/inventory-options?search=${"x".repeat(101)}`)).status, 400);
        assert.equal((await request("/inventory-options?search[$ne]=x")).status, 400);
      });
      await t.test("save explicit draft and inventory link, audit record atomic; no uncertain auto-match", async () => {
        const saved = await request("/B01", "manager", draft({ inventoryRecipe: String(inventory._id), reviewNotes: "  Check exact supplier labels  " }));
        assert.equal(saved.status, 200); assert.equal(saved.body.data.revision, 1); assert.equal(saved.body.data.persisted, true);
        assert.equal(saved.body.data.reviewNotes, "Check exact supplier labels"); assert.equal(saved.body.data.inventoryRecipe, String(inventory._id));
        assert.equal((await request("", "kitchen")).body.data.length, 0);
        const audit = await AuditLog.findOne({ entityType: "RecipeInstruction" }); assert.equal(audit.entityLabel, "B01 · Double Beef Cheeseburger");
        assert.equal(audit.actorRole, "manager"); assert.equal(audit.after.inventoryRecipe, String(inventory._id));
      });
      await t.test("stable codes/source/content and unapproved status protected, unsafe links/unknown fields rejected", async () => {
        for (const extra of [{ code: "B02" }, { status: "approved" }, { ingredients: [] }, { servingPhoto: "https://example.com/photo" }, { recipeVersion: "2" }, { costs: 5 }]) assert.equal((await request("/B01", "admin", draft({ revision: 1, ...extra }))).status, 400);
        assert.equal((await request("/B01", "admin", draft({ revision: 1, inventoryRecipe: "bad-id" }))).status, 400);
        assert.equal((await request("/B01", "admin", draft({ revision: 1, inventoryRecipe: new mongoose.Types.ObjectId().toString() }))).status, 400);
        assert.equal((await request("/B01", "admin", draft({ revision: 1, reviewNotes: "x".repeat(3001) }))).status, 400);
        assert.equal((await request("/B01", "admin", draft())).status, 409);
        assert.equal(await AuditLog.countDocuments({ entityType: "RecipeInstruction" }), 1);
      });
      await t.test("concurrent alias saves produce one record and conflict; revision prevents lost update", async () => {
        const results = await Promise.all([request("/S1", "admin", draft()), request("/HB01", "manager", draft())]);
        assert.deepEqual(results.map(row => row.status).sort(), [200, 409]); assert.equal(await RecipeInstruction.countDocuments({ code: "HB01" }), 1);
        const edits = await Promise.all([request("/HB01", "admin", draft({ revision: 1, reviewNotes: "A" })), request("/S1", "manager", draft({ revision: 1, reviewNotes: "B" }))]);
        assert.deepEqual(edits.map(row => row.status).sort(), [200, 409]);
        assert.equal((await request("/S1")).body.data.revision, 2);
      });
      await t.test("safe read serializer never returns costing/trial financial fields", () => {
        const serialized = serializeInstruction({ ...pilotByCode("B01"), cost: 100, costPerServing: 15, proposedSellingPrice: 50, createdBy: users.admin, secret: "not-public" });
        for (const key of ["cost", "costPerServing", "proposedSellingPrice", "createdBy", "secret"]) assert.equal(serialized[key], undefined);
      });
      await t.test("audit failure rolls back instruction save; retry saves one draft without stock writes", async () => {
        const originalCreate = AuditLog.create;
        AuditLog.create = async () => { throw new Error("Isolated injected audit failure"); };
        try { assert.equal((await request("/T1", "admin", draft())).status, 500); }
        finally { AuditLog.create = originalCreate; }
        assert.equal(await RecipeInstruction.countDocuments({ code: "T1" }), 0);
        const response = await request("/T1", "admin", draft({ status: "draft" }));
        assert.equal(response.status, 200); assert.equal(response.body.data.status, "draft");
        assert.equal(await RecipeInstruction.countDocuments({ code: "T1" }), 1);
        assert.equal(await AuditLog.countDocuments({ entityLabel: "T1 · Caramelized Onion" }), 1);
      });
      await t.test("all reads/saves leave physical stock, batches, inventory recipe, orders/movements unchanged", async () => {
        assert.deepEqual(await InventoryItem.findById(ingredient._id).lean(), stockBefore);
        assert.deepEqual(await InventoryBatch.findById(batch._id).lean(), batchBefore);
        assert.deepEqual(await InventoryRecipe.findById(inventory._id).lean(), inventoryBefore);
        assert.equal(await StockTransaction.countDocuments(), 0); assert.equal(await Order.countDocuments(), 0);
      });
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
