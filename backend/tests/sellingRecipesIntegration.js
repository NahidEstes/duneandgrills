import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import MenuItem from "../models/MenuItem.js";
import MenuAddOn from "../models/MenuAddOn.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import AddOnInventoryRecipe from "../models/AddOnInventoryRecipe.js";
import InventoryBatch from "../models/InventoryBatch.js";
import StockTransaction from "../models/StockTransaction.js";
import AuditLog from "../models/AuditLog.js";
import Order from "../models/Order.js";
import inventoryRoutes from "../routes/inventoryRoutes.js";
import { saveSellingRecipe, getSellingRecipe, previewSellingRecipe, sellingRecipeHistory, listSellingRecipes } from "../services/sellingRecipeService.js";
import { savePreparationRecipe } from "../services/preparationService.js";
import { createOrder } from "../controllers/orderController.js";

process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "owned-selling-recipe-tests"; process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "false";
test("selling recipes use server quantities, atomic revisions and read-only planning on an owned replica", { timeout: 120000 }, async t => withIsolatedMongo(async () => {
  const actor = await User.create({ name: "Owned recipe admin", role: "admin", email: "recipes@fixture.invalid", password: "OwnedPassword123!" });
  const category = await InventoryCategory.create({ name: "Owned recipe stock", skuPrefix: "SRC" });
  let serial = 0;
  const menu = (name = "Owned dish " + ++serial) => MenuItem.create({ name, description: "Owned fixture", price: 20, image: "/fixture.jpg", category: "Food" });
  const item = (values = {}) => InventoryItem.create({ name: "Owned ingredient " + ++serial, sku: "SRC-" + serial, category: category._id, unit: "kg", currentStock: 5, unitCost: 12, ...values });
  const raw = await item({ purchaseUnit: "bag", purchaseConversionFactor: 2.5 });
  const dish = await menu(), addon = await MenuAddOn.create({ name: "Owned extra", price: 2, menuItems: [dish._id] });
  const body = (inventory = raw, quantity = 250, unit = "g") => ({ expectedRevision: null, doNotTrack: false, isActive: true, ingredients: [{ inventoryItem: String(inventory._id), quantity, enteredUnit: unit, isActive: true }] });
  const write = (kind, target, payload) => saveSellingRecipe(actor, kind, String(target._id), payload);
  const review = (target, payload, kind = "menu") => previewSellingRecipe(actor, { ...payload, kind, id: String(target._id) });
  const stockState = async () => JSON.stringify({ items: await InventoryItem.find().sort({ _id: 1 }).select("currentStock stockVersion unitCost").lean(), batches: await InventoryBatch.find().sort({ _id: 1 }).lean(), movements: await StockTransaction.find().lean() });
  let saved;
  await t.test("metric and purchase conversions persist base fields and entered metadata without touching stock", async () => {
    const before = await stockState(); saved = await write("menu", dish, body());
    assert.equal(await stockState(), before);
    assert.equal(saved.recipe.ingredients[0].quantityPerSale, .25); assert.equal(saved.recipe.ingredients[0].enteredQuantity, 250); assert.equal(saved.recipe.ingredients[0].unit, "kg");
    assert.equal(saved.metrics.totalEstimatedIngredientCost, 3); assert.ok(saved.recipeRevision);
    assert.ok((await InventoryItem.findById(raw._id)).menuItems.some(id => String(id) === String(dish._id)));
    const conversion = await review(dish, body(raw, 2, "bag"));
    assert.equal(conversion.normalizedIngredients[0].quantityPerSale, 5);
    const liquid = await item({ unit: "L" }); const volume = await review(dish, body(liquid, 150, "ml")); assert.equal(volume.normalizedIngredients[0].quantityPerSale, .15);
    // Compare only pre-existing stock, excluding the newly created independent liquid fixture.
    assert.equal((await InventoryItem.findById(raw._id)).currentStock, 5); assert.equal(await StockTransaction.countDocuments(), 0);
    assert.equal(JSON.parse(before).batches.length, 0);
    for (const [quantity, unit] of [[0,"g"],[-1,"g"],[true,"g"],[1e10,"g"],[.00001,"g"],[250,"ml"],[1,"tray"]]) await assert.rejects(review(dish, body(raw, quantity, unit)));
    await assert.rejects(write("menu", dish, { ...body(), expectedRevision: saved.recipeRevision, ingredients: [...body().ingredients, ...body().ingredients] }), /duplicate/);
    await assert.rejects(write("menu", dish, { ...body(), expectedRevision: undefined }), error => error.status === 409);
    const noRevision = body(); delete noRevision.expectedRevision; await assert.rejects(write("menu", dish, noRevision), error => error.status === 428);
    assert.equal(await StockTransaction.countDocuments(), 0);
  });
  await t.test("expiry, unknown quality, depleted history and physical ceilings use the sale engine eligibility", async () => {
    const stock = await item({ currentStock: 7, tracksExpiry: true });
    const batch = (quantity, expiryDate, qualityStatus = "usable") => InventoryBatch.create({ item: stock._id, lotNumber: "SRC-LOT-" + ++serial, source: "STOCK_IN", receivedQuantity: quantity, remainingQuantity: quantity, unitCost: 7, expiryDate, qualityStatus });
    await batch(2, "2035-01-01"); await batch(3, "2000-01-01"); await batch(4, null); await batch(5, "2035-01-01", "quarantined");
    const before = await stockState(), result = await review(dish, { ...body(stock, .6, "kg"), portions: 4 });
    assert.equal(result.portionsAvailable, 3); assert.equal(result.ingredients[0].usable, 2); assert.equal(result.ingredients[0].physicalStock, 7); assert.equal(result.ingredients[0].required, 2.4); assert.equal(result.ingredients[0].shortage, .4);
    assert.equal(await stockState(), before);
    await InventoryItem.updateOne({ _id: stock._id }, { $set: { currentStock: .5 } });
    assert.equal((await review(dish, body(stock, .25, "kg"))).portionsAvailable, 2);
    await InventoryBatch.updateMany({ item: stock._id }, { $set: { remainingQuantity: 0 } });
    assert.equal((await review(dish, body(stock))).portionsAvailable, 0);
    const legacy = await item({ currentStock: 1.2 }); assert.equal((await review(dish, body(legacy, .4, "kg"))).portionsAvailable, 3);
    assert.equal((await review(dish, { ...body(), doNotTrack: true })).portionsAvailable, null);
  });
  await t.test("combined menu and addon requirements aggregate shared ingredients and reject malformed selections", async () => {
    await write("addon", addon, body(raw, .5, "kg"));
    const result = await review(dish, { ...body(raw, .5, "kg"), portions: 6, addOns: [{ id: String(addon._id), quantity: 1 }] });
    assert.equal(result.scope, "menu_with_selected_addons"); assert.equal(result.portionsAvailable, 5); assert.equal(result.ingredients[0].quantityPerPortion, 1); assert.equal(result.ingredients[0].shortage, 1);
    assert.deepEqual(result.ingredients[0].origins, [dish.name, addon.name]);
    await assert.rejects(review(dish, { ...body(), addOns: [null] }), /Invalid/);
    await assert.rejects(review(dish, { ...body(), portions: true }), /Quantity/);
    await assert.rejects(review(dish, { ...body(), addOns: [{ id: String(addon._id), quantity: true }] }), /Quantity/);
    const addonSaved = await getSellingRecipe("addon", addon._id); assert.ok(addonSaved.inventoryRecipe); assert.equal(addonSaved.metrics.totalEstimatedIngredientCost, 6);
  });
  await t.test("concurrent first creates and same-revision edits have one winner, retaining stale drafts server-side", async () => {
    const target = await menu();
    const created = await Promise.allSettled([write("menu", target, body()), write("menu", target, body(raw, 500))]);
    assert.equal(created.filter(row => row.status === "fulfilled").length, 1); assert.equal(created.find(row => row.status === "rejected").reason.status, 409);
    const current = await getSellingRecipe("menu", target._id);
    const edits = await Promise.allSettled([write("menu", target, { ...body(), expectedRevision: current.recipeRevision }), write("menu", target, { ...body(raw, 500), expectedRevision: current.recipeRevision })]);
    assert.equal(edits.filter(row => row.status === "fulfilled").length, 1); assert.equal(edits.find(row => row.status === "rejected").reason.status, 409);
    assert.equal(await InventoryRecipe.countDocuments({ menuItem: target._id }), 1);
    assert.equal(await AuditLog.countDocuments({ entityType: "InventoryRecipe", entityId: current.recipe._id }), 2);
  });
  await t.test("audit failure rolls back recipe, ingredient links and revision atomically", async () => {
    const replacement = await item(), before = await getSellingRecipe("menu", dish._id), stocks = await stockState(), count = await AuditLog.countDocuments();
    const original = AuditLog.create; AuditLog.create = async () => { throw Error("Owned audit failure"); };
    try { await assert.rejects(write("menu", dish, { ...body(replacement), expectedRevision: before.recipeRevision }), /Owned audit failure/); }
    finally { AuditLog.create = original; }
    assert.equal((await getSellingRecipe("menu", dish._id)).recipeRevision, before.recipeRevision);
    assert.equal(String((await InventoryRecipe.findOne({ menuItem: dish._id })).ingredients[0].inventoryItem), String(raw._id));
    assert.ok((await InventoryItem.findById(raw._id)).menuItems.some(id => String(id) === String(dish._id)));
    assert.equal((await InventoryItem.findById(replacement._id)).menuItems.length, 0);
    assert.equal(await AuditLog.countDocuments(), count); assert.equal(await stockState(), stocks);
  });
  await t.test("Do Not Track requires explicit confirmation plus audit reason, preserves historical costs, and clears only mapping links", async () => {
    const orderBody = { user: actor, body: { customer: { name: "Owned", phone: "0500000000" }, orderType: "takeaway", items: [{ productId: String(dish._id), productType: "menuItem", quantity: 1 }] } };
    let orderResult; await createOrder(orderBody, { status() { return this; }, json(value) { orderResult = value.data; return this; } }, error => { throw error; });
    const originalOrder = JSON.stringify(await Order.findById(orderResult._id).lean()), originalMoves = JSON.stringify(await StockTransaction.find({ order: orderResult._id }).lean());
    const before = await getSellingRecipe("menu", dish._id), stocks = await stockState(), tracking = { ...body(), expectedRevision: before.recipeRevision, doNotTrack: true };
    await assert.rejects(write("menu", dish, tracking), /Confirm Do Not Track/);
    const result = await write("menu", dish, { ...tracking, confirmDoNotTrack: true, reason: "Owned non-stock recipe exclusion" });
    assert.equal(result.recipe.ingredients.length, 0); assert.equal(result.metrics.profitMargin, null); assert.equal((await InventoryItem.findById(raw._id)).menuItems.some(id => String(id) === String(dish._id)), false);
    assert.equal(await stockState(), stocks);
    assert.equal(JSON.stringify(await Order.findById(orderResult._id).lean()), originalOrder); assert.equal(JSON.stringify(await StockTransaction.find({ order: orderResult._id }).lean()), originalMoves);
    const history = await sellingRecipeHistory(actor, "menu", dish._id);
    assert.equal(history.data[0].after.doNotTrack, true); assert.equal(history.data[0].before.ingredients[0].quantity, .25); assert.equal(history.data[0].reason, "Owned non-stock recipe exclusion");
    await assert.rejects(sellingRecipeHistory({ role: "storekeeper" }, "menu", dish._id), error => error.status === 403);
  });
  await t.test("new inactive mappings reject, retained inactive rows can be repaired, missing costs remain unknown, zero remains known", async () => {
    const target = await menu(), inactive = await item({ isActive: false });
    await assert.rejects(write("menu", target, body(inactive)), /Inactive/);
    await InventoryRecipe.create({ menuItem: target._id, ingredients: [{ inventoryItem: inactive._id, quantityPerSale: .1, unit: "kg", isActive: true }], updatedBy: actor._id });
    const current = await getSellingRecipe("menu", target._id); assert.equal(current.recipeStatus, "not_configured");
    await write("menu", target, { ...body(inactive, .1, "kg"), expectedRevision: current.recipeRevision, ingredients: [{ ...body(inactive, .1, "kg").ingredients[0], isActive: false }] });
    const unknown = await item(); await InventoryItem.collection.updateOne({ _id: unknown._id }, { $unset: { unitCost: "" } });
    const estimate = await review(target, body(unknown)); assert.equal(estimate.metrics.totalEstimatedIngredientCost, null);
    const free = await item({ unitCost: 0 }); assert.equal((await review(target, body(free))).metrics.totalEstimatedIngredientCost, 0);
  });
  await t.test("missing database uniqueness protection blocks first-write races before any recipe or audit write", async () => {
    const target = await menu(), before = await AuditLog.countDocuments();
    await InventoryRecipe.collection.dropIndex("menuItem_1");
    try {
      await assert.rejects(write("menu", target, { ...body(), doNotTrack: true, confirmDoNotTrack: true, reason: "Owned index check" }), error => error.status === 503);
      assert.equal(await InventoryRecipe.countDocuments({ menuItem: target._id }), 0); assert.equal(await AuditLog.countDocuments(), before);
    } finally { await InventoryRecipe.collection.createIndex({ menuItem: 1 }, { unique: true }); }
  });
  await t.test("HTTP pagination/export cover all filtered matches, picker finds >100, and permissions protect history and writes", async () => {
    await MenuItem.insertMany(Array.from({ length: 125 }, (_, index) => ({ name: "Export fixture " + String(index).padStart(3, "0"), description: "Owned export", category: "Food", image: "/fixture.jpg", price: 10 })));
    const prepared = await item({ name: "ZZZ prepared" });
    await savePreparationRecipe(actor, { name: "Owned prepared recipe", finishedItem: String(prepared._id), outputQuantity: 1, outputUnit: "kg", ingredients: [{ inventoryItem: String(raw._id), quantity: 1, unit: "kg" }], isActive: true });
    await InventoryItem.insertMany(Array.from({ length: 125 }, (_, i) => ({ name: "AAA filler " + i, sku: "SRC-FILLER-" + i, category: category._id, unit: "kg", isActive: true })));
    const app = express(); app.use(express.json()); app.use("/api/inventory", inventoryRoutes); app.use((error, _req, res, _next) => res.status(error.status || 400).json({ message: error.message }));
    const server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    const origin = "http://127.0.0.1:" + server.address().port + "/api/inventory", headers = { Authorization: "Bearer " + jwt.sign({ id: actor._id, sv: 0 }, process.env.JWT_SECRET) };
    try {
      const list = await (await fetch(origin + "/recipes?search=Export%20fixture&limit=20&page=2", { headers })).json(); assert.equal(list.data.length, 20); assert.equal(list.pagination.total, 125);
      for (const [scope, expected] of [["page",20],["all",125]]) {
        const response = await fetch(origin + "/recipes/export?search=Export%20fixture&limit=20&page=2&scope=" + scope, { headers });
        assert.equal(response.status, 200); assert.equal(response.headers.get("x-export-rows"), String(expected)); assert.equal((await response.text()).trim().split("\r\n").length, expected + 1);
      }
      const picker = await (await fetch(origin + "/item-options?search=ZZZ&recipeType=prepared", { headers })).json(); assert.equal(picker.data[0]._id, String(prepared._id)); assert.equal(picker.data[0].recipeType, "prepared");
      const details = await (await fetch(origin + "/items/" + prepared._id, { headers })).json(); assert.equal(details.data._id, String(prepared._id));
      const viewer = await User.create({ name: "Owned accountant", role: "accountant", email: "recipe-viewer@fixture.invalid", password: "OwnedPassword123!" });
      const viewerHeaders = { Authorization: "Bearer " + jwt.sign({ id: viewer._id, sv: 0 }, process.env.JWT_SECRET), "Content-Type": "application/json" };
      assert.equal((await fetch(origin + "/recipes/" + dish._id, { headers: viewerHeaders })).status, 200);
      assert.equal((await fetch(origin + "/recipes/" + dish._id, { method: "PUT", headers: viewerHeaders, body: JSON.stringify(body()) })).status, 403);
      assert.equal((await fetch(origin + "/recipes/" + dish._id + "/history", { headers: viewerHeaders })).status, 403);
      assert.equal((await listSellingRecipes("addon", { limit: 1 })).pagination.total, 1);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
}));
