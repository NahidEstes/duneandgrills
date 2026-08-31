import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import StockTransaction from "../models/StockTransaction.js";
import Supplier from "../models/Supplier.js";
import User from "../models/User.js";
import { createOpeningBalance, performStockMovement } from "../services/inventoryStockService.js";
import { createPurchaseOrder, receivePurchaseOrder } from "../services/purchaseOrderService.js";

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
  assert.equal(await StockTransaction.countDocuments({ item: item._id }), 3);
  assert.equal((await PurchaseOrder.findById(order._id)).items[0].receivedQuantity, 5);

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
