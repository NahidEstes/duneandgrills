import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import MenuItem from "../models/MenuItem.js";
import Order from "../models/Order.js";
import StockTransaction from "../models/StockTransaction.js";
import User from "../models/User.js";
import { createHistoricalDeliveryOrder } from "../services/deliveryOrderService.js";
import { createOpeningBalance } from "../services/inventoryStockService.js";
import { listKitchenOrders } from "../services/kitchenService.js";

process.env.NODE_ENV = "test";
process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "true";
const uri = process.env.MONGO_TEST_URI || "mongodb://127.0.0.1:27017/duneandgrills_delivery_order_test";

const run = async () => {
  await mongoose.connect(uri);
  if (!mongoose.connection.db.databaseName.endsWith("_test")) throw new Error("Refusing to use a non-test database");
  await mongoose.connection.dropDatabase();
  await Order.syncIndexes();

  const actor = await User.create({ name: "Delivery Test Admin", email: "delivery-test@example.com", password: "StrongPass123!", role: "admin" });
  const category = await InventoryCategory.create({ name: "Delivery Test Ingredients" });
  const ingredient = await InventoryItem.create({ name: "Delivery Beef", sku: "DEL-BEEF-001", category: category._id, unit: "kg", unitCost: 30 });
  await createOpeningBalance(ingredient, 10, actor._id);
  const item = await MenuItem.create({ name: "Delivery Burger", description: "Historical entry test", price: 25, category: "Burgers", image: "/burger.jpg" });
  await InventoryRecipe.create({ menuItem: item._id, updatedBy: actor._id, ingredients: [{ inventoryItem: ingredient._id, quantityPerSale: 0.5, unit: "kg", isActive: true }] });
  const settings = { orders: { channels: { jahez: true, keeta: true, hungerstation: true, ninja: true } } };
  const payload = { provider: "jahez", externalOrderId: "JHS-CONCURRENT-1", orderOccurredAt: new Date(Date.now() - 86400000), entryStatus: "completed", platformTotal: 25, branch: "Riyadh — Main", items: [{ productId: item._id, productType: "menuItem", quantity: 1 }] };

  const results = await Promise.allSettled([
    createHistoricalDeliveryOrder({ payload, actor, restaurantSettings: settings }),
    createHistoricalDeliveryOrder({ payload, actor, restaurantSettings: settings }),
  ]);
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1, "one concurrent entry must win");
  const rejection = results.find((row) => row.status === "rejected").reason;
  assert.equal(rejection.status, 409);
  assert.match(rejection.message, /already saved/);
  assert.equal(await Order.countDocuments({ deliveryProvider: "jahez", externalOrderId: "JHS-CONCURRENT-1" }), 1);

  const saved = await Order.findOne({ externalOrderId: "JHS-CONCURRENT-1" }).lean();
  assert.equal(saved.source, "jahez");
  assert.equal(saved.manualEntry, true);
  assert.equal(saved.status, "delivered");
  assert.equal(saved.paymentStatus, "paid");
  assert.equal(saved.totalAmount, 25, "server price must win");
  assert.equal(saved.orderOccurredAt.toISOString(), payload.orderOccurredAt.toISOString());
  assert.equal(saved.inventoryTransactions.length, 1);
  assert.equal(await StockTransaction.countDocuments({ order: saved._id, movementType: "STOCK_OUT" }), 1);
  assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 9.5);
  assert.equal((await listKitchenOrders()).some((row) => String(row._id) === String(saved._id)), false);
  assert.ok(await AuditLog.findOne({ action: "DELIVERY_ORDER_MANUALLY_ENTERED", entityId: saved._id }));

  await createHistoricalDeliveryOrder({ payload: { ...payload, provider: "keeta", externalOrderId: "JHS-CONCURRENT-1", entryStatus: "cancelled" }, actor, restaurantSettings: settings });
  assert.equal(await Order.countDocuments({ externalOrderId: "JHS-CONCURRENT-1" }), 2, "same external ID may exist for different providers");
  assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 9.5, "cancelled entry must not deduct stock");
  const cancelled = await Order.findOne({ deliveryProvider: "keeta" }).lean();
  assert.equal(cancelled.paymentStatus, "voided");
  assert.equal(cancelled.inventoryStatus, "not_required");

  await assert.rejects(
    createHistoricalDeliveryOrder({ payload: { ...payload, externalOrderId: "DIFF-1", platformTotal: 27 }, actor, restaurantSettings: settings }),
    /Explain the difference/
  );

  console.log("Quick delivery order integration checks passed.");
  await mongoose.disconnect();
};

run().catch(async (error) => { console.error(error); await mongoose.disconnect().catch(() => {}); process.exitCode = 1; });
