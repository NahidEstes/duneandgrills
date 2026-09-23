import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createPosSale } from "../controllers/posController.js";
import { createOrder, getOrderById, trackGuestOrder } from "../controllers/orderController.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import MenuItem from "../models/MenuItem.js";
import Order from "../models/Order.js";
import StockTransaction from "../models/StockTransaction.js";
import User from "../models/User.js";
import { createOpeningBalance } from "../services/inventoryStockService.js";
import { listKitchenOrders, transitionKitchenOrder } from "../services/kitchenService.js";
import AuditLog from "../models/AuditLog.js";
import RestaurantSettings from "../models/RestaurantSettings.js";
import { getRestaurantSettingsDefaults, updateRestaurantSettings } from "../services/restaurantSettingsService.js";
import { nextOrderNumber } from "../services/orderNumberService.js";

process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "true";

const testUri =
  process.env.MONGO_TEST_URI ||
  "mongodb://127.0.0.1:27017/duneandgrills_pos_test";

const invokeCreateSale = async (user, body) => {
  let statusCode = 200;
  let payload;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return value;
    },
  };
  await createPosSale(
    { user, body },
    response,
    (error) => {
      throw error;
    }
  );
  return { statusCode, payload };
};

const invokeCreateWebsiteOrder = async (user, body) => {
  let statusCode = 200;
  let payload;
  await createOrder(
    { user, body },
    {
      status(code) { statusCode = code; return this; },
      json(value) { payload = value; return value; },
    }
  );
  return { statusCode, payload };
};

const invokeJsonController = async (handler, req) => {
  let statusCode = 200;
  let payload;
  await handler(req, { status(code) { statusCode = code; return this; }, json(value) { payload = value; return value; } });
  return { statusCode, payload };
};

const run = async () => {
  await mongoose.connect(testUri);
  const databaseName = mongoose.connection.db.databaseName;
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to run destructive integration checks against ${databaseName}`
    );
  }
  await mongoose.connection.dropDatabase();

  const admin = await User.create({
    name: "POS Test Admin",
    email: "pos-admin@example.com",
    password: "TestPassword123!",
    role: "admin",
  });
  const customer = await User.create({
    name: "POS Test Customer",
    email: "pos-customer@example.com",
    phone: "0500000000",
    password: "TestPassword123!",
    role: "customer",
  });
  const otherCustomer = await User.create({ name: "Other Customer", email: "other-customer@example.com", phone: "0511111111", password: "TestPassword123!", role: "customer" });
  const settings = getRestaurantSettingsDefaults();
  settings.orders.deliveryFee = 12;
  settings.orders.minimumDeliveryOrder = 20;
  settings.preparation.defaultMinutes = 17;
  await updateRestaurantSettings(settings, admin);
  const settingsAudit = await AuditLog.findOne({ action: "RESTAURANT_SETTINGS_UPDATED" }).lean();
  assert.deepEqual(settingsAudit.metadata.changedFields.sort(), ["orders.deliveryFee", "orders.minimumDeliveryOrder", "preparation.defaultMinutes"]);
  const category = await InventoryCategory.create({ name: "POS Ingredients" });
  const ingredient = await InventoryItem.create({
    name: "POS Beef",
    sku: "POS-BEEF-001",
    category: category._id,
    unit: "kg",
    unitCost: 30,
  });
  await createOpeningBalance(ingredient, 10, admin._id);

  const menuItem = await MenuItem.create({
    name: "POS Burger",
    description: "Server-authoritative POS test item",
    price: 25,
    category: "Burgers",
    image: "/pos-burger.jpg",
  });
  await InventoryRecipe.create({
    menuItem: menuItem._id,
    ingredients: [
      {
        inventoryItem: ingredient._id,
        quantityPerSale: 0.2,
        unit: "kg",
      },
    ],
    updatedBy: admin._id,
  });

  const request = {
    idempotencyKey: "pos-integration-sale-1",
    items: [
      {
        productId: menuItem._id.toString(),
        productType: "menuItem",
        quantity: 2,
        price: 0.01,
      },
    ],
    orderType: "dine-in",
    paymentMethod: "cash",
    cashReceived: 50,
    discountAmount: 5,
    discountReason: "Manager discount",
    customerId: customer._id.toString(),
  };

  const created = await invokeCreateSale(admin, request);
  assert.equal(created.statusCode, 201);
  assert.equal(created.payload.data.source, "pos");
  assert.equal(created.payload.data.subtotal, 50);
  assert.equal(created.payload.data.totalAmount, 45);
  assert.equal(created.payload.data.changeDue, 5);
  assert.equal(created.payload.data.paymentStatus, "paid");
  assert.equal(created.payload.data.status, "pending");
  assert.equal(created.payload.data.estimatedPreparationMinutes, 17);
  assert.equal(created.payload.data.inventoryStatus, "deducted");
  assert.match(created.payload.data.orderNumber, /^DG-\d{8}-\d{4}$/);
  assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 9.6);
  assert.equal(
    await StockTransaction.countDocuments({
      order: created.payload.data._id,
      movementType: "STOCK_OUT",
    }),
    1
  );
  assert.equal((await User.findById(customer._id)).pointsBalance, 450);

  await transitionKitchenOrder({ orderId: created.payload.data._id, nextStatus: "confirmed", actor: admin, estimatedPreparationMinutes: 18 });
  await transitionKitchenOrder({ orderId: created.payload.data._id, nextStatus: "preparing", actor: admin });
  await transitionKitchenOrder({ orderId: created.payload.data._id, nextStatus: "ready", actor: admin });
  const kitchenOrder = (await listKitchenOrders()).find((order) => String(order._id) === String(created.payload.data._id));
  assert.equal(kitchenOrder.status, "ready");
  assert.equal(kitchenOrder.estimatedPreparationMinutes, 18);
  assert.equal(kitchenOrder.customerName, "POS Test Customer");
  assert.equal("phone" in kitchenOrder, false);
  assert.equal("totalAmount" in kitchenOrder, false);
  assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 9.6);
  assert.equal(await StockTransaction.countDocuments({ order: created.payload.data._id, movementType: "STOCK_OUT" }), 1);
  assert.equal(await AuditLog.countDocuments({ entityId: created.payload.data._id, action: "KITCHEN_ORDER_STATUS_CHANGED" }), 3);
  await assert.rejects(
    transitionKitchenOrder({ orderId: created.payload.data._id, nextStatus: "ready", actor: admin }),
    /already ready/
  );

  const websiteCreated = await invokeCreateWebsiteOrder(customer, {
    customer: { name: customer.name, phone: customer.phone, address: "Private test address" },
    items: [{ productId: menuItem._id.toString(), productType: "menuItem", quantity: 1 }],
    orderType: "delivery",
  });
  assert.equal(websiteCreated.statusCode, 201);
  const websiteOrder = websiteCreated.payload.data;
  assert.match(websiteOrder.orderNumber, /^DG-\d{8}-\d{4}$/);
  assert.equal(Number(websiteOrder.orderNumber.slice(-4)), Number(created.payload.data.orderNumber.slice(-4)) + 1);
  assert.equal(typeof websiteCreated.payload.trackingToken, "string");
  const ownPrivate = await invokeJsonController(getOrderById, { params: { id: websiteOrder._id }, user: customer });
  assert.equal(ownPrivate.statusCode, 200);
  assert.equal("customer" in ownPrivate.payload.data, false);
  const otherPrivate = await invokeJsonController(getOrderById, { params: { id: websiteOrder._id }, user: otherCustomer });
  assert.equal(otherPrivate.statusCode, 404);
  const adminPrivate = await invokeJsonController(getOrderById, { params: { id: websiteOrder._id }, user: admin });
  assert.equal(adminPrivate.statusCode, 200);
  assert.equal(adminPrivate.payload.data.customer.name, customer.name);
  const tracked = await invokeJsonController(trackGuestOrder, { params: { orderNumber: websiteOrder.orderNumber }, query: {}, headers: { "x-order-tracking-token": websiteCreated.payload.trackingToken } });
  assert.equal(tracked.statusCode, 200);
  for (const field of ["customer", "notes", "trackingTokenHash", "inventoryTransactions", "_id"]) assert.equal(field in tracked.payload.data, false);
  const invalidTrack = await invokeJsonController(trackGuestOrder, { params: { orderNumber: websiteOrder.orderNumber }, query: {}, headers: { "x-order-tracking-token": "wrong-token" } });
  assert.equal(invalidTrack.statusCode, 404);
  assert.equal(websiteOrder.status, "pending");
  assert.equal(websiteOrder.deliveryFee, 12);
  assert.equal(websiteOrder.totalAmount, 37);
  assert.equal(websiteOrder.estimatedPreparationMinutes, 17);
  assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 9.4);
  assert.equal(await StockTransaction.countDocuments({ order: websiteOrder._id, movementType: "STOCK_OUT" }), 1);
  const concurrentNumbers = await Promise.all(Array.from({ length: 12 }, () => nextOrderNumber()));
  assert.equal(new Set(concurrentNumbers).size, concurrentNumbers.length);
  assert.equal(concurrentNumbers.every((value) => /^DG-\d{8}-\d{4}$/.test(value)), true);
  const nextDayNumber = await nextOrderNumber({ date: new Date("2030-01-01T21:05:00.000Z") });
  assert.equal(nextDayNumber, "DG-20300102-0001");
  await transitionKitchenOrder({ orderId: websiteOrder._id, nextStatus: "confirmed", actor: admin });
  await transitionKitchenOrder({ orderId: websiteOrder._id, nextStatus: "preparing", actor: admin });
  await transitionKitchenOrder({ orderId: websiteOrder._id, nextStatus: "ready", actor: admin });
  assert.equal((await Order.findById(websiteOrder._id)).status, "ready");
  assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 9.4);
  assert.equal(await StockTransaction.countDocuments({ order: websiteOrder._id, movementType: "STOCK_OUT" }), 1);

  const duplicate = await invokeCreateSale(admin, request);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.payload.duplicate, true);
  assert.equal(await Order.countDocuments({ source: "pos" }), 1);
  assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 9.4);

  await assert.rejects(
    invokeCreateSale(admin, {
      ...request,
      idempotencyKey: "pos-integration-sale-2",
      cashReceived: 10,
    }),
    /Cash received must cover the final total/
  );

  await RestaurantSettings.updateOne({ key: "default" }, { $set: { "orders.minimumDeliveryOrder": 30 } });
  const belowMinimum = await invokeCreateWebsiteOrder(customer, {
    customer: { name: customer.name, phone: customer.phone, address: "Private test address" },
    items: [{ productId: menuItem._id.toString(), productType: "menuItem", quantity: 1 }],
    orderType: "delivery",
  });
  assert.equal(belowMinimum.statusCode, 400);
  assert.match(belowMinimum.payload.message, /Minimum delivery order/);

  await RestaurantSettings.updateOne({ key: "default" }, { $set: { "orders.channels.website": false } });
  const websiteDisabled = await invokeCreateWebsiteOrder(customer, {
    customer: { name: customer.name, phone: customer.phone, address: "Private test address" },
    items: [{ productId: menuItem._id.toString(), productType: "menuItem", quantity: 2 }],
    orderType: "delivery",
  });
  assert.equal(websiteDisabled.statusCode, 503);
  assert.match(websiteDisabled.payload.message, /currently unavailable/);

  await RestaurantSettings.updateOne({ key: "default" }, { $set: { "orders.channels.pos": false } });
  await assert.rejects(
    invokeCreateSale(admin, { ...request, idempotencyKey: "pos-integration-disabled" }),
    /POS ordering is currently disabled/
  );

  console.log("POS integration checks passed");
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
