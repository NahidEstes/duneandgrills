import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryBatch from "../models/InventoryBatch.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import AddOnInventoryRecipe from "../models/AddOnInventoryRecipe.js";
import MenuItem from "../models/MenuItem.js";
import MenuAddOn from "../models/MenuAddOn.js";
import Combo from "../models/Combo.js";
import Order from "../models/Order.js";
import StockTransaction from "../models/StockTransaction.js";
import CashMovement from "../models/CashMovement.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import RestaurantSettings from "../models/RestaurantSettings.js";
import inventoryRoutes from "../routes/inventoryRoutes.js";
import { createOrder } from "../controllers/orderController.js";
import { createPosSale } from "../controllers/posController.js";
import { listRecipes, updateRecipe } from "../controllers/inventory/recipeController.js";
import { listAddOnRecipes, updateAddOnRecipe } from "../controllers/inventory/addOnRecipeController.js";
import { createHistoricalDeliveryOrder } from "../services/deliveryOrderService.js";
import { resolveCartLines, calculateCartSubtotal } from "../services/catalogService.js";
import { getSaleableInventory, isExpiredInventory } from "../services/inventoryEligibilityService.js";
import { collectReorderInputs } from "../services/reorderService.js";
import { getBatchSnapshots, ensureLegacyBatch } from "../services/inventoryBatchService.js";
import { performStockMovement, runInventoryTransaction } from "../services/inventoryStockService.js";
import { recipeReadiness } from "../services/recipeReadinessService.js";
import { toBaseQuantity } from "../services/inventoryUnitService.js";
import { openPosShift } from "../services/posShiftService.js";

// No dotenv, external URI, reset or existing database: the helper owns a temporary replica set.
process.env.NODE_ENV = "test";
process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "false";
process.env.JWT_SECRET = "isolated-stock-recipe-test-secret";

async function invoke(handler, req) {
  let status = 200; let body;
  await handler({ query: {}, params: {}, body: {}, ...req }, {
    status(code) { status = code; return this; }, json(value) { body = value; return value; },
  }, error => { throw error; });
  if (status >= 400) throw Object.assign(new Error(body.message), { status });
  return body;
}

test("Phase 1 stock and recipe accuracy (isolated replica set)", { timeout: 180000 }, async t => {
  await withIsolatedMongo(async () => {
    const actor = await User.create({ name: "Safety Admin", email: "safety@test.local", password: "TestPassword123!", role: "admin" });
    const category = await InventoryCategory.create({ name: "Safety ingredients", skuPrefix: "SAFE" });
    let sequence = 0;
    const item = (options = {}) => InventoryItem.create({ name: `Ingredient ${++sequence}`, sku: `SAFE-${sequence}`, category: category._id, unit: "kg", unitCost: 10, tracksExpiry: true, ...options });
    const batch = (ingredient, quantity, expiryDate, qualityStatus = "usable", options = {}) => InventoryBatch.create({ item: ingredient._id, lotNumber: `LOT-${++sequence}`, receivedQuantity: quantity || 1, remainingQuantity: quantity, unitCost: 10, expiryDate, qualityStatus, source: "STOCK_IN", ...options });
    const menu = () => MenuItem.create({ name: `Dish ${++sequence}`, description: "Safety fixture", price: 20, image: "/test.jpg", category: "Food", customization: { enabled: true } });
    const recipe = (dish, ingredient, quantity = 1, options = {}) => InventoryRecipe.create({ menuItem: dish._id, updatedBy: actor._id, ingredients: ingredient ? [{ inventoryItem: ingredient._id, quantityPerSale: quantity, unit: ingredient.unit }] : [], ...options });
    const line = (product, options = {}) => ({ productId: String(product._id), productType: "menuItem", quantity: 1, ...options });
    const sale = async (channel, items, options = {}) => {
      if (channel === "website") {
        const created = (await invoke(createOrder, { user: actor, body: { customer: { name: "Test", phone: "0500000000" }, orderType: "takeaway", items, ...options } })).data;
        return Order.findById(created._id);
      }
      if (channel === "pos") return (await invoke(createPosSale, { user: actor, body: { idempotencyKey: crypto.randomUUID(), terminal: "MAIN", orderType: "dine-in", paymentMethod: "card", items, ...options } })).data;
      return createHistoricalDeliveryOrder({ actor, restaurantSettings: {}, payload: { provider: "jahez", externalOrderId: `SAFETY-${++sequence}`, orderOccurredAt: new Date(Date.now() - 1000), entryStatus: "completed", branch: "Test", platformTotal: calculateCartSubtotal(await resolveCartLines(items)), items, ...options } });
    };
    const counts = async () => Promise.all([Order.countDocuments(), StockTransaction.countDocuments(), CashMovement.countDocuments(), AuditLog.countDocuments()]);

    await t.test("Riyadh expiry day is inclusive; tracked unknown expiry is blocked", async () => {
      const ingredient = await item({ currentStock: 5 });
      await batch(ingredient, 2, "2030-01-02"); await batch(ingredient, 3, null);
      const lastMinute = new Date("2030-01-02T20:59:59Z"); const nextDay = new Date("2030-01-02T21:00:00Z");
      assert.equal(isExpiredInventory("2030-01-02", lastMinute), false);
      assert.equal(isExpiredInventory("2030-01-02", nextDay), true);
      assert.equal((await getSaleableInventory(ingredient, { now: lastMinute })).saleableStock, 2);
      assert.equal((await collectReorderInputs(ingredient, { now: nextDay })).usableOnHand, 0);
      const nonPerishable = await item({ currentStock: 1, tracksExpiry: false });
      await batch(nonPerishable, 1, null);
      assert.equal((await getSaleableInventory(nonPerishable)).saleableStock, 1);
    });

    await t.test("eligible FEFO ignores expired, quarantined, damaged and unknown-expiry stock", async () => {
      for (const channel of ["website", "pos", "delivery"]) {
        const ingredient = await item({ currentStock: 14 });
        const expired = await batch(ingredient, 3, "2000-01-01");
        const quarantined = await batch(ingredient, 2, "2098-01-01", "quarantined");
        const damaged = await batch(ingredient, 2, "2098-01-01", "damaged");
        const unknown = await batch(ingredient, 4, null);
        const later = await batch(ingredient, 2, "2099-02-01", "usable", { brand: "Brand B" });
        const earlier = await batch(ingredient, 1, "2099-01-01", "usable", { brand: "Brand A" });
        const dish = await menu(); await recipe(dish, ingredient);
        const order = await sale(channel, [line(dish, { quantity: 2, price: 0.01 })]);
        assert.equal(order.subtotal, 40); // Pricing remains server-authoritative.
        const movement = await StockTransaction.findOne({ order: order._id });
        assert.deepEqual(movement.batchAllocations.map(row => String(row.batch)), [String(earlier._id), String(later._id)]);
        assert.deepEqual(movement.batchAllocations.map(row => row.quantity), [1, 1]);
        for (const untouched of [expired, quarantined, damaged, unknown]) assert.equal((await InventoryBatch.findById(untouched._id)).remainingQuantity, untouched.remainingQuantity);
        const current = await InventoryItem.findById(ingredient._id);
        assert.equal(current.currentStock, 12);
        assert.equal((await collectReorderInputs(current)).usableOnHand, 1);
        const before = await counts();
        await assert.rejects(sale(channel, [line(dish, { quantity: 2 })]), /saleable.*physical/);
        assert.deepEqual(await counts(), before);
        assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 12);
        if (channel === "pos") {
          const repeat = await sale(channel, [line(dish, { quantity: 2 })], { idempotencyKey: order.idempotencyKey });
          assert.equal(String(repeat._id), String(order._id));
          assert.equal(await StockTransaction.countDocuments({ order: order._id }), 1);
        }
      }
    });

    await t.test("all ineligible batches leave physical stock positive and reorder usable zero", async () => {
      const ingredient = await item({ currentStock: 6 });
      await batch(ingredient, 2, "2000-01-01"); await batch(ingredient, 2, "2099-01-01", "damaged"); await batch(ingredient, 2, "2099-01-01", "quarantined");
      const stock = await getSaleableInventory(ingredient);
      assert.equal(stock.saleableStock, 0); assert.equal(stock.physicalStock, 6); assert.equal(stock.legacyStockFallback, false);
      assert.equal((await collectReorderInputs(ingredient)).usableOnHand, 0);
      const dish = await menu(); await recipe(dish, ingredient);
      for (const channel of ["website", "pos", "delivery"]) {
        const before = await counts(); await assert.rejects(sale(channel, [line(dish)]), /only 0 saleable \(6 physical\)/); assert.deepEqual(await counts(), before);
      }
      assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 6);
    });

    await t.test("legacy compatibility only without any batch history; gaps are not safe stock", async () => {
      const depleted = await item({ currentStock: 5 }); await batch(depleted, 0, "2099-01-01");
      assert.equal((await getSaleableInventory(depleted)).saleableStock, 0);
      assert.equal(await ensureLegacyBatch(depleted), null);
      const snapshots = (await getBatchSnapshots({ includeDepleted: false })).filter(row => String(row.item?._id) === String(depleted._id));
      assert.equal(snapshots.length, 1); assert.equal(snapshots[0].unallocated, true); assert.equal(snapshots[0].saleableQuantity, 0);
      for (const [options, expected] of [[{ tracksExpiry: false }, 5], [{ expiryDate: null }, 0], [{ expiryDate: "2000-01-01" }, 0], [{ expiryDate: "2099-01-01" }, 5]]) {
        const legacy = await item({ currentStock: 5, ...options });
        assert.equal((await getSaleableInventory(legacy)).saleableStock, expected);
        assert.equal((await collectReorderInputs(legacy)).legacyStockFallback, true);
        const dish = await menu(); await recipe(dish, legacy);
        if (expected) { await sale("pos", [line(dish)]); assert.equal(await InventoryBatch.countDocuments({ item: legacy._id, isLegacy: true }), 1); }
        else await assert.rejects(sale("pos", [line(dish)]), /saleable/);
      }
    });

    await t.test("missing, inactive and empty recipes block every channel; only explicit Do Not Track skips", async () => {
      for (const channel of ["website", "pos", "delivery"]) {
        for (const kind of ["missing", "inactive", "empty", "disabled_ingredients"]) {
          const dish = await menu();
          if (kind !== "missing") await recipe(dish, null, 1, { isActive: kind !== "inactive" });
          if (kind === "disabled_ingredients") {
            const ingredient = await item({ tracksExpiry: false, currentStock: 3 });
            await InventoryRecipe.updateOne({ menuItem: dish._id }, { $set: { ingredients: [{ inventoryItem: ingredient._id, quantityPerSale: 1, unit: "kg", isActive: false }] } });
          }
          const before = await counts(); await assert.rejects(sale(channel, [line(dish)]), /Configure a recipe or mark Do Not Track/); assert.deepEqual(await counts(), before);
          await InventoryRecipe.updateOne({ menuItem: dish._id }, { $set: { doNotTrack: true, isActive: false } }, { upsert: true });
          const allowed = await sale(channel, [line(dish)]); assert.equal(allowed.inventoryStatus, "not_required");
        }
        const dish = await menu(); await recipe(dish, null, 1, { doNotTrack: true });
        const addOn = await MenuAddOn.create({ name: `Extra ${++sequence}`, price: 2, menuItems: [dish._id] });
        const selected = line(dish, { customization: { selectedAddOns: [{ addOn: addOn._id, quantity: 1 }] } });
        for (const kind of ["missing", "inactive", "empty"]) {
          if (kind !== "missing") await AddOnInventoryRecipe.findOneAndUpdate({ addOn: addOn._id }, { $set: { ingredients: [], isActive: kind !== "inactive" } }, { upsert: true });
          const before = await counts(); await assert.rejects(sale(channel, [selected]), /Add-on Extra/); assert.deepEqual(await counts(), before);
        }
        await AddOnInventoryRecipe.updateOne({ addOn: addOn._id }, { $set: { doNotTrack: true } });
        const allowed = await sale(channel, [selected]); assert.equal(allowed.subtotal, 22); assert.equal(allowed.inventoryStatus, "not_required");
        assert.equal(String(allowed.items[0].selectedAddOns[0].addOn), String(addOn._id));
      }
    });

    await t.test("invalid ingredients and units reject; management shows identical recipe readiness", async () => {
      const ingredient = await item({ currentStock: 5, tracksExpiry: false }); const dish = await menu(); const saved = await recipe(dish, ingredient);
      for (const ingredients of [
        [{ inventoryItem: ingredient._id, quantityPerSale: 0, unit: "kg" }],
        [{ inventoryItem: ingredient._id, quantityPerSale: 1, unit: "g" }],
        [{ inventoryItem: new mongoose.Types.ObjectId(), quantityPerSale: 1, unit: "kg" }],
        [{ inventoryItem: ingredient._id, quantityPerSale: 1, unit: "kg" }, { inventoryItem: ingredient._id, quantityPerSale: 2, unit: "kg" }],
      ]) {
        await InventoryRecipe.collection.updateOne({ _id: saved._id }, { $set: { ingredients } });
        await assert.rejects(sale("pos", [line(dish)]), /recipe|ingredient/i);
        const result = await invoke(listRecipes, { query: { search: dish.name, limit: 100 } }); const displayed = result.data.find(row => String(row._id) === String(dish._id));
        assert.equal(displayed.recipeStatus, "not_configured"); assert.ok(displayed.recipeIssue);
      }
      await InventoryRecipe.collection.updateOne({ _id: saved._id }, { $set: { ingredients: [{ inventoryItem: ingredient._id, quantityPerSale: 1, unit: "kg" }] } });
      await InventoryItem.updateOne({ _id: ingredient._id }, { $set: { isActive: false } });
      await assert.rejects(sale("pos", [line(dish)]), /inactive inventory/);
      assert.equal(recipeReadiness({ ingredients: [], doNotTrack: "true" }).status, "not_configured");
      await assert.rejects(invoke(updateRecipe, { user: actor, params: { menuItemId: dish._id }, body: { doNotTrack: "true" } }), /explicit boolean/);
      const addOn = await MenuAddOn.create({ name: `Bad addon ${++sequence}`, price: 1, menuItems: [dish._id] });
      await AddOnInventoryRecipe.create({ addOn: addOn._id, isActive: false, updatedBy: actor._id });
      assert.equal((await invoke(listAddOnRecipes, {})).data.find(row => String(row._id) === String(addOn._id)).recipeStatus, "not_configured");
      await assert.rejects(invoke(updateAddOnRecipe, { user: actor, params: { addOnId: addOn._id }, body: { doNotTrack: "true" } }), /explicit boolean/);
    });

    await t.test("combo/add-on quantities use existing base-unit conversion and snapshots", async () => {
      for (const channel of ["website", "pos", "delivery"]) {
        const ingredient = await item({ unit: "g", currentStock: toBaseQuantity(2, 1000) }); await batch(ingredient, 2000, "2099-01-01");
        const dish = await menu(); await recipe(dish, ingredient, 150);
        const combo = await Combo.create({ name: `Combo ${++sequence}`, slug: `combo-${sequence}`, description: "Test", image: "/test.jpg", regularPrice: 60, comboPrice: 50, status: "published", items: [{ menuItem: dish._id, quantity: 3 }] });
        const addOn = await MenuAddOn.create({ name: `Sauce ${++sequence}`, price: 2, menuItems: [dish._id] });
        await AddOnInventoryRecipe.create({ addOn: addOn._id, updatedBy: actor._id, ingredients: [{ inventoryItem: ingredient._id, quantityPerAddOn: 50, unit: "g" }] });
        const order = await sale(channel, [line(combo, { productType: "combo", quantity: 2 }), line(dish, { quantity: 2, customization: { selectedAddOns: [{ addOn: addOn._id, quantity: 2 }] } })]);
        const movement = await StockTransaction.findOne({ order: order._id });
        assert.equal(movement.quantity, 1400); // 2*3*150 + 2*150 + 2*2*50.
        assert.deepEqual(movement.sourceDetails.lineQuantities.map(row => row.quantity), [900, 500]);
        assert.equal(movement.sourceDetails.components.find(row => row.type === "add_on_recipe").ingredientQuantity, 200);
        assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 600);
        await InventoryRecipe.updateOne({ menuItem: dish._id }, { $set: { isActive: false } });
        await assert.rejects(sale(channel, [line(combo, { productType: "combo" })]), /Recipe is inactive/);
        await InventoryRecipe.updateOne({ menuItem: dish._id }, { $set: { isActive: true } });
        await Combo.collection.updateOne({ _id: combo._id }, { $set: { "items.0.quantity": 0 } });
        // The existing Order schema may reject malformed combo snapshots before inventory validation.
        const beforeInvalidCombo = await counts();
        await assert.rejects(sale(channel, [line(combo, { productType: "combo" }), line(dish)]));
        assert.deepEqual(await counts(), beforeInvalidCombo);
      }
    });

    await t.test("smallest six-decimal quantity is deducted rather than silently skipped", async () => {
      const ingredient = await item({ currentStock: 0.000001, tracksExpiry: false });
      const dish = await menu(); await recipe(dish, ingredient, 0.000001);
      const order = await sale("pos", [line(dish)]);
      const movement = await StockTransaction.findOne({ order: order._id });
      assert.equal(movement.batchAllocations[0].quantity, 0.000001);
      assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 0);
      assert.equal((await InventoryBatch.findOne({ item: ingredient._id })).remainingQuantity, 0);
      await assert.rejects(sale("pos", [line(dish)]), /only 0 saleable/);
    });

    await t.test("add-on ingredient availability, base unit and quantities are mandatory in all channels", async () => {
      const ingredient = await item({ currentStock: 5 }); await batch(ingredient, 5, "2099-01-01");
      const dish = await menu(); await recipe(dish, null, 1, { doNotTrack: true });
      const addon = await MenuAddOn.create({ name: `Tracked Add-on ${++sequence}`, price: 2, menuItems: [dish._id] });
      const saved = await AddOnInventoryRecipe.create({ addOn: addon._id, updatedBy: actor._id, ingredients: [{ inventoryItem: ingredient._id, quantityPerAddOn: 1, unit: "kg" }] });
      const selected = line(dish, { customization: { selectedAddOns: [{ addOn: addon._id }] } });
      for (const badLine of [
        { inventoryItem: ingredient._id, quantityPerAddOn: 0, unit: "kg" },
        { inventoryItem: ingredient._id, quantityPerAddOn: 1, unit: "g" },
        { inventoryItem: new mongoose.Types.ObjectId(), quantityPerAddOn: 1, unit: "kg" },
      ]) {
        await AddOnInventoryRecipe.collection.updateOne({ _id: saved._id }, { $set: { ingredients: [badLine] } });
        for (const channel of ["website", "pos", "delivery"]) await assert.rejects(sale(channel, [selected]), /recipe|ingredient/i);
      }
    });

    await t.test("concurrent cross-channel sales cannot oversell eligible stock", async () => {
      const ingredient = await item({ currentStock: 11 }); await batch(ingredient, 10, "2000-01-01"); await batch(ingredient, 1, "2099-01-01");
      const dish = await menu(); await recipe(dish, ingredient);
      const results = await Promise.allSettled(["website", "pos", "delivery"].map(channel => sale(channel, [line(dish)])));
      assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
      assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 10);
      assert.equal(await StockTransaction.countDocuments({ item: ingredient._id, movementType: "STOCK_OUT" }), 1);
      assert.equal(await Order.countDocuments({ "items.menuItem": dish._id }), 1);
    });

    await t.test("failure after stock deductions rolls back order, cash ledger, audit and every batch", async () => {
      await RestaurantSettings.create({ key: "default", posShifts: { enabled: true, requireOpenShift: true } });
      await openPosShift({ actor, terminal: "MAIN", openingCash: 50 });
      const first = await item({ currentStock: 5 }); const second = await item({ currentStock: 5 });
      const firstBatch = await batch(first, 5, "2099-01-01"); const secondBatch = await batch(second, 5, "2099-01-01");
      const dish = await menu(); await recipe(dish, first);
      await InventoryRecipe.updateOne({ menuItem: dish._id }, { $push: { ingredients: { inventoryItem: second._id, quantityPerSale: 1, unit: "kg" } } });
      const before = await counts(); const create = CashMovement.create;
      CashMovement.create = async () => { throw new Error("Injected cash ledger failure after inventory deductions"); };
      try { await assert.rejects(sale("pos", [line(dish)], { paymentMethod: "cash", cashReceived: 100 }), /Injected cash ledger/); }
      finally { CashMovement.create = create; }
      assert.deepEqual(await counts(), before);
      for (const ingredient of [first, second]) assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 5);
      for (const original of [firstBatch, secondBatch]) assert.equal((await InventoryBatch.findById(original._id)).remainingQuantity, 5);
    });

    await t.test("authorized audited waste/damage/write-off still remove ineligible physical stock", async () => {
      for (const movementType of ["WASTE", "DAMAGED", "ADJUSTMENT"]) {
        const ingredient = await item({ currentStock: 2 }); const original = await batch(ingredient, 2, "2000-01-01", "damaged");
        const result = await runInventoryTransaction(session => performStockMovement({ itemId: ingredient._id, movementType, quantity: 1, reason: "Authorized expired stock write-off", userId: actor._id }, { session }));
        assert.equal(result.item.currentStock, 1); assert.equal((await InventoryBatch.findById(original._id)).remainingQuantity, 1);
        assert.ok(await AuditLog.exists({ entityId: ingredient._id, action: "INVENTORY_STOCK_MOVEMENT" }));
        assert.equal((await getSaleableInventory(result.item)).saleableStock, 0);
      }
      const app = express(); app.use(express.json()); app.use("/inventory", inventoryRoutes); app.use((err, _req, res, _next) => res.status(err.status || 500).json({ message: err.message }));
      const server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
      try {
        const origin = `http://127.0.0.1:${server.address().port}/inventory/waste`;
        assert.equal((await fetch(origin, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401);
        const customer = await User.create({ name: "Denied", email: "denied@test.local", password: "TestPassword123!", role: "customer" });
        const token = jwt.sign({ id: customer._id, sv: customer.sessionVersion || 0 }, process.env.JWT_SECRET);
        assert.equal((await fetch(origin, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: "{}" })).status, 403);
      } finally { await new Promise(resolve => server.close(resolve)); }
    });
  });
});
