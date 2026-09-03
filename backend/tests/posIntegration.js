import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createPosSale } from "../controllers/posController.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import MenuItem from "../models/MenuItem.js";
import Order from "../models/Order.js";
import StockTransaction from "../models/StockTransaction.js";
import User from "../models/User.js";
import { createOpeningBalance } from "../services/inventoryStockService.js";

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
  assert.equal(created.payload.data.status, "delivered");
  assert.equal(created.payload.data.inventoryStatus, "deducted");
  assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 9.6);
  assert.equal(
    await StockTransaction.countDocuments({
      order: created.payload.data._id,
      movementType: "STOCK_OUT",
    }),
    1
  );
  assert.equal((await User.findById(customer._id)).pointsBalance, 450);

  const duplicate = await invokeCreateSale(admin, request);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.payload.duplicate, true);
  assert.equal(await Order.countDocuments({ source: "pos" }), 1);
  assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 9.6);

  await assert.rejects(
    invokeCreateSale(admin, {
      ...request,
      idempotencyKey: "pos-integration-sale-2",
      cashReceived: 10,
    }),
    /Cash received must cover the final total/
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
