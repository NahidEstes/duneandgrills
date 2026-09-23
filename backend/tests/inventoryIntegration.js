import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryBatch from "../models/InventoryBatch.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import InventoryCount from "../models/InventoryCount.js";
import MenuItem from "../models/MenuItem.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import StockTransaction from "../models/StockTransaction.js";
import Supplier from "../models/Supplier.js";
import User from "../models/User.js";
import { createOpeningBalance, performStockMovement } from "../services/inventoryStockService.js";
import { deductOrderInventory, restoreOrderInventory } from "../services/orderInventoryService.js";
import { createPurchaseOrder, receivePurchaseOrder } from "../services/purchaseOrderService.js";
import { completeCount, createCount, reviewCount, submitCount } from "../controllers/inventory/stockController.js";
import AuditLog from "../models/AuditLog.js";

process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "true";

const invoke = async (handler, req) => {
  let statusCode = 200;
  let payload;
  await handler(req, { status(code) { statusCode = code; return this; }, json(value) { payload = value; return value; } }, (error) => { throw error; });
  return { statusCode, payload };
};

const testUri = process.env.MONGO_TEST_URI || "mongodb://127.0.0.1:27017/duneandgrills_inventory_test";

const run = async () => {
  await mongoose.connect(testUri);
  const databaseName = mongoose.connection.db.databaseName;
  if (!databaseName.endsWith("_test")) throw new Error(`Refusing to run destructive integration checks against ${databaseName}`);
  await mongoose.connection.dropDatabase();

  const user = await User.create({ name: "Inventory Test Manager", email: "inventory-test@example.com", password: "TestPassword123!", role: "admin" });
  const category = await InventoryCategory.create({ name: "Test Ingredients" });
  const supplier = await Supplier.create({ code: "TEST-SUP", name: "Test Supplier" });
  const item = await InventoryItem.create({ name: "Test Item", sku: "TEST-ITEM-001", category: category._id, supplier: supplier._id, unit: "kg", reorderLevel: 2, unitCost: 10 });

  await createOpeningBalance(item, 10, user._id);
  await performStockMovement({ itemId: item._id, movementType: "STOCK_OUT", quantity: 3, reason: "Integration check", userId: user._id });
  assert.equal((await InventoryItem.findById(item._id)).currentStock, 7);

  await assert.rejects(
    performStockMovement({ itemId: item._id, movementType: "STOCK_OUT", quantity: 8, reason: "Must fail", userId: user._id }),
    /Insufficient stock/
  );
  assert.equal((await InventoryItem.findById(item._id)).currentStock, 7);

  const order = await createPurchaseOrder({ supplier: supplier._id, status: "ordered", tax: 0, notes: "Integration check", items: [{ item: item._id, quantity: 5, unitCost: 11 }] }, user._id);
  const receipt = await receivePurchaseOrder(order._id, [{ lineId: order.items[0]._id, quantity: 5 }], user._id);
  assert.equal(receipt.order.status, "received");
  assert.equal((await InventoryItem.findById(item._id)).currentStock, 12);
  assert.equal((await PurchaseOrder.findById(order._id)).items[0].receivedQuantity, 5);

  const waste = await performStockMovement({ itemId: item._id, movementType: "WASTE", quantity: 1, reason: "Spoiled", reasonCode: "SPOILED", userId: user._id });
  assert.equal((await InventoryItem.findById(item._id)).currentStock, 11);
  assert.equal(waste.transaction.unitCost, 10);
  assert.match(waste.transaction.reference, /^WST-/);
  await InventoryItem.updateOne({ _id: item._id }, { allowNegativeStock: true });
  await assert.rejects(
    performStockMovement({ itemId: item._id, movementType: "WASTE", quantity: 12, reason: "Must fail", reasonCode: "OTHER", userId: user._id, respectItemNegativeStock: false }),
    /Insufficient stock/
  );

  const menuItem = await MenuItem.create({ name: "Test Burger", description: "Integration recipe", price: 25, category: "Burgers", image: "/test.jpg" });
  const recipe = await InventoryRecipe.create({ menuItem: menuItem._id, ingredients: [{ inventoryItem: item._id, quantityPerSale: 0.2, unit: "kg" }], updatedBy: user._id });
  assert.equal(recipe.ingredients.length, 1);
  const duplicateMenuItem = await MenuItem.create({ name: "Duplicate Test", description: "Duplicate ingredient check", price: 10, category: "Test", image: "/test.jpg" });
  await assert.rejects(
    InventoryRecipe.create({ menuItem: duplicateMenuItem._id, ingredients: [{ inventoryItem: item._id, quantityPerSale: 1, unit: "kg" }, { inventoryItem: item._id, quantityPerSale: 2, unit: "kg" }], updatedBy: user._id }),
    /same inventory item twice/
  );
  assert.equal(await StockTransaction.countDocuments({ item: item._id }), 4);

  const posOrderId = new mongoose.Types.ObjectId();
  const deductions = await deductOrderInventory({
    catalogLines: [{ productType: "menuItem", product: menuItem, quantity: 2 }],
    orderId: posOrderId,
    orderNumber: "POS-TEST-0001",
    source: "pos",
    actorId: user._id,
    strictRecipes: true,
  });
  assert.equal(deductions.length, 1);
  assert.equal((await InventoryItem.findById(item._id)).currentStock, 10.6);
  assert.equal(String(deductions[0].order), String(posOrderId));

  const restorations = await restoreOrderInventory({
    transactionIds: deductions.map((transaction) => transaction._id),
    orderId: posOrderId,
    orderNumber: "POS-TEST-0001",
    actorId: user._id,
    status: "cancelled",
  });
  assert.equal(restorations.length, 1);
  assert.equal((await InventoryItem.findById(item._id)).currentStock, 11);
  assert.deepEqual(
    restorations[0].batchAllocations.map((allocation) => allocation.lotNumber),
    deductions[0].batchAllocations.map((allocation) => allocation.lotNumber)
  );
  await assert.rejects(
    deductOrderInventory({
      catalogLines: [{ productType: "menuItem", product: duplicateMenuItem, quantity: 1 }],
      orderId: new mongoose.Types.ObjectId(),
      orderNumber: "POS-TEST-0002",
      source: "pos",
      actorId: user._id,
      strictRecipes: true,
    }),
    /Configure a recipe or mark Do Not Track/
  );

  const bottledItem = await InventoryItem.create({
    name: "Test Bottled Drink",
    sku: "TEST-BOTTLE-001",
    category: category._id,
    supplier: supplier._id,
    unit: "bottle",
    purchaseUnit: "carton",
    purchaseConversionFactor: 24,
    reorderLevel: 12,
    unitCost: 2,
    tracksExpiry: true,
  });
  const batchOrder = await createPurchaseOrder({
    supplier: supplier._id,
    status: "ordered",
    tax: 0,
    items: [{ item: bottledItem._id, quantity: 2, unitCost: 48 }],
  }, user._id);
  await receivePurchaseOrder(batchOrder._id, [{
    lineId: batchOrder.items[0]._id,
    quantity: 1,
    lotNumber: "LATE-LOT",
    expiryDate: "2027-06-01",
  }], user._id);
  await receivePurchaseOrder(batchOrder._id, [{
    lineId: batchOrder.items[0]._id,
    quantity: 1,
    lotNumber: "EARLY-LOT",
    expiryDate: "2027-01-01",
  }], user._id);
  assert.equal((await InventoryItem.findById(bottledItem._id)).currentStock, 48);
  assert.equal((await InventoryItem.findById(bottledItem._id)).unitCost, 2);

  const fefoMovement = await performStockMovement({
    itemId: bottledItem._id,
    movementType: "STOCK_OUT",
    quantity: 30,
    reason: "FEFO integration check",
    userId: user._id,
  });
  assert.deepEqual(
    fefoMovement.transaction.batchAllocations.map((allocation) => [allocation.lotNumber, allocation.quantity]),
    [["EARLY-LOT", 24], ["LATE-LOT", 6]]
  );
  assert.equal((await InventoryBatch.findOne({ lotNumber: "EARLY-LOT" })).remainingQuantity, 0);
  assert.equal((await InventoryBatch.findOne({ lotNumber: "LATE-LOT" })).remainingQuantity, 18);

  const started = await invoke(createCount, { user, body: { itemIds: [item._id], blindCount: true } });
  assert.equal(started.statusCode, 201);
  const count = started.payload.data;
  await performStockMovement({ itemId: item._id, movementType: "STOCK_OUT", quantity: 1, reason: "Sale during count", userId: user._id });
  const conflicted = await invoke(completeCount, {
    user,
    params: { id: count._id },
    body: { items: [{ lineId: count.items[0]._id, countedQuantity: count.items[0].expectedQuantity }] },
  });
  assert.equal(conflicted.statusCode, 409);
  assert.equal((await InventoryCount.findById(count._id)).status, "review_required");
  const stockAfterSale = (await InventoryItem.findById(item._id)).currentStock;
  assert.equal(stockAfterSale, count.items[0].expectedQuantity - 1);
  await invoke(reviewCount, { user, params: { id: count._id }, body: {} });
  const reviewed = await InventoryCount.findById(count._id);
  const completed = await invoke(completeCount, {
    user,
    params: { id: count._id },
    body: { items: [{ lineId: reviewed.items[0]._id, countedQuantity: stockAfterSale }] },
  });
  assert.equal(completed.statusCode, 200);
  assert.equal((await InventoryCount.findById(count._id)).status, "completed");
  assert.equal((await InventoryItem.findById(item._id)).currentStock, stockAfterSale);
  assert.equal(await AuditLog.countDocuments({ entityId: count._id, action: "INVENTORY_COUNT_COMPLETED" }), 1);
  const secondStarted = await invoke(createCount, { user, body: { itemIds: [item._id], blindCount: true } });
  const secondCount = secondStarted.payload.data;
  const submittedForApproval = await invoke(submitCount, { user, params: { id: secondCount._id }, body: { items: [{ lineId: secondCount.items[0]._id, countedQuantity: stockAfterSale }] } });
  assert.equal(submittedForApproval.payload.data.status, "review_required");
  const approved = await invoke(completeCount, { user, params: { id: secondCount._id }, body: { items: [] } });
  assert.equal(approved.statusCode, 200);
  assert.equal((await InventoryCount.findById(secondCount._id)).status, "completed");

  console.log("Inventory integration checks passed");
};

try {
  await run();
} finally {
  if (mongoose.connection.readyState === 1) {
    const databaseName = mongoose.connection.db.databaseName;
    if (databaseName.endsWith("_test")) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
