import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import {
  createCustomerNote,
  deleteCustomerNote,
  getCustomerOverview,
  listCustomerDirectory,
  listCustomerFavouriteItems,
  listCustomerNotes,
  listCustomerOrders,
  listCustomerRewardHistory,
  updateCustomerNote,
} from "../services/customerCrmService.js";
import { authorize } from "../middleware/auth.js";

const testUri = process.env.MONGO_TEST_URI || "mongodb://127.0.0.1:27017/duneandgrills_customer_crm_test";

const orderPayload = ({ customer, orderNumber, source, status, totalAmount, items, createdAt }) => ({
  user: customer._id,
  orderNumber,
  source,
  createdBy: source === "pos" ? customer._id : null,
  customer: { name: customer.name, email: customer.email, phone: customer.phone, address: customer.address },
  items,
  orderType: source === "pos" ? "dine-in" : "delivery",
  subtotal: totalAmount,
  originalSubtotal: totalAmount,
  discountAmount: 0,
  deliveryFee: 0,
  totalAmount,
  paymentMethod: source === "pos" ? "cash" : "unrecorded",
  paymentStatus: status === "refunded" ? "refunded" : "paid",
  status,
  createdAt,
  updatedAt: createdAt,
});

const run = async () => {
  await mongoose.connect(testUri);
  const databaseName = mongoose.connection.db.databaseName;
  if (!databaseName.endsWith("_test")) throw new Error(`Refusing to run destructive integration checks against ${databaseName}`);
  await mongoose.connection.dropDatabase();

  const admin = await User.create({ name: "CRM Admin", email: "crm-admin@example.com", password: "TestPassword123!", role: "admin" });
  const customer = await User.create({
    name: "CRM Customer",
    email: "crm-customer@example.com",
    phone: "0500000001",
    address: "Riyadh test address",
    password: "TestPassword123!",
    role: "customer",
    pointsBalance: 80,
    pointTransactions: [{ type: "EARN", points: 80, description: "Order #CRM-001", balanceAfter: 80, sourceKey: "CRM:EARN:1", createdAt: new Date("2026-08-01T09:00:00Z") }],
  });
  const legacyCustomer = await User.create({ name: "No Orders Customer", email: "no-orders@example.com", password: "TestPassword123!", role: "customer" });
  await User.collection.updateOne(
    { _id: legacyCustomer._id },
    { $unset: { pointsBalance: "" }, $set: { rewardPoints: 17 } }
  );

  const burgerId = new mongoose.Types.ObjectId();
  const comboId = new mongoose.Types.ObjectId();
  const burger = { productType: "menuItem", menuItem: burgerId, name: "Beef Burger", image: "", price: 25, quantity: 2 };
  const combo = { productType: "combo", combo: comboId, name: "Dune Combo", image: "", price: 50, quantity: 1 };
  await Order.create([
    orderPayload({ customer, orderNumber: "CRM-001", source: "website", status: "delivered", totalAmount: 100, items: [burger, combo], createdAt: new Date("2026-08-01T09:00:00Z") }),
    orderPayload({ customer, orderNumber: "CRM-002", source: "pos", status: "pending", totalAmount: 50, items: [{ ...burger, quantity: 1 }], createdAt: new Date("2026-08-11T09:00:00Z") }),
    orderPayload({ customer, orderNumber: "CRM-003", source: "website", status: "cancelled", totalAmount: 999, items: [{ ...burger, quantity: 10 }], createdAt: new Date("2026-08-12T09:00:00Z") }),
    orderPayload({ customer, orderNumber: "CRM-004", source: "website", status: "refunded", totalAmount: 300, items: [combo], createdAt: new Date("2026-08-13T09:00:00Z") }),
  ]);

  const directory = await listCustomerDirectory({ search: "CRM Customer", page: 1, limit: 10 });
  assert.equal(directory.pagination.total, 1);
  assert.equal(directory.data[0].totalOrders, 4);
  assert.equal(directory.data[0].validOrders, 2);
  assert.equal(directory.data[0].totalSpent, 150);

  const noOrders = await listCustomerDirectory({ activity: "no-orders" });
  assert.equal(noOrders.pagination.total, 1);
  assert.equal(noOrders.data[0].name, "No Orders Customer");
  assert.equal(noOrders.data[0].pointsBalance, 17);

  const legacyOverview = await getCustomerOverview(legacyCustomer._id);
  assert.equal(legacyOverview.customer.pointsBalance, 17);

  const overview = await getCustomerOverview(customer._id);
  assert.equal(overview.analytics.totalOrders, 4);
  assert.equal(overview.analytics.validOrders, 2);
  assert.equal(overview.analytics.completedOrders, 1);
  assert.equal(overview.analytics.cancelledOrRefundedOrders, 2);
  assert.equal(overview.analytics.totalSpent, 150);
  assert.equal(overview.analytics.averageOrderValue, 75);
  assert.equal(overview.analytics.averageDaysBetweenOrders, 10);

  const orders = await listCustomerOrders(customer._id, { source: "pos", page: 1, limit: 10 });
  assert.equal(orders.pagination.total, 1);
  assert.equal(orders.data[0].orderNumber, "CRM-002");
  assert.match(orders.data[0].itemsSummary, /Beef Burger/);

  const favourites = await listCustomerFavouriteItems(customer._id);
  const burgerFavourite = favourites.find((row) => row.name === "Beef Burger");
  assert.equal(burgerFavourite.totalQuantity, 3);
  assert.equal(burgerFavourite.orderCount, 2);
  assert.equal(burgerFavourite.totalSpending, 75);
  assert.equal(favourites.some((row) => row.totalSpending === 9990), false);

  const rewards = await listCustomerRewardHistory(customer._id);
  assert.equal(rewards.pagination.total, 1);
  assert.equal(rewards.data[0].points, 80);

  const created = await createCustomerNote({ customerId: customer._id, text: "  Prefers a quiet table.  ", actor: admin });
  assert.equal(created.text, "Prefers a quiet table.");
  const updated = await updateCustomerNote({ customerId: customer._id, noteId: created._id, text: "Prefers a quiet corner table.", actor: admin });
  assert.equal(updated.text, "Prefers a quiet corner table.");
  assert.equal((await listCustomerNotes(customer._id)).length, 1);
  await deleteCustomerNote({ customerId: customer._id, noteId: created._id, actor: admin });
  assert.equal((await listCustomerNotes(customer._id)).length, 0);
  assert.equal(await AuditLog.countDocuments({ entityType: "CustomerNote" }), 3);

  let authorizationStatus;
  authorize("admin", "manager")(
    { user: customer },
    { status(code) { authorizationStatus = code; return this; }, json() { return this; } },
    () => { throw new Error("Customer must not pass CRM authorization"); }
  );
  assert.equal(authorizationStatus, 403);

  console.log("Customer CRM integration checks passed");
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
