import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import User from "../models/User.js";
import MenuItem from "../models/MenuItem.js";
import MenuAddOn from "../models/MenuAddOn.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import AddOnInventoryRecipe from "../models/AddOnInventoryRecipe.js";
import Order from "../models/Order.js";
import AuditLog from "../models/AuditLog.js";
import PosHeldSale from "../models/PosHeldSale.js";
import { createHeldSale, getHeldSale, listHeldSales, updateHeldSale } from "../controllers/posHeldSaleController.js";
import { requestPosDiscountApproval } from "../controllers/posDiscountController.js";
import { createPosSale } from "../controllers/posController.js";
import { createPinLookup, hashStaffPin } from "../services/attendanceService.js";
import { resolveCartLines } from "../services/catalogService.js";

process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "true";
process.env.JWT_SECRET ||= "pos-phase-1-test-secret-that-is-long-enough";
const uri = process.env.MONGO_TEST_URI || "mongodb://127.0.0.1:27017/duneandgrills_pos_phase1_test";

const invoke = async (handler, user, body = {}, params = {}, query = {}) => {
  let statusCode = 200; let payload; let thrown;
  await handler({ user, body, params, query, correlationId: `test-${Date.now()}`, ip: "127.0.0.1" }, { status(code) { statusCode = code; return this; }, json(value) { payload = value; return value; } }, (error) => { thrown = error; });
  if (thrown) throw thrown;
  return { statusCode, payload };
};

const run = async () => {
  await mongoose.connect(uri);
  if (!mongoose.connection.db.databaseName.endsWith("_test")) throw new Error("Refusing to run outside a test database");
  await mongoose.connection.dropDatabase();
  const cashier = await User.create({ name: "Cashier One", email: "cashier1@example.com", password: "Password123!", role: "cashier" });
  const otherCashier = await User.create({ name: "Cashier Two", email: "cashier2@example.com", password: "Password123!", role: "cashier" });
  const pin = "4321";
  const manager = await User.create({ name: "Manager", email: "manager@example.com", password: "Password123!", role: "manager", pinHash: await hashStaffPin(pin), pinLookup: createPinLookup(pin) });
  const item = await MenuItem.create({ name: "Phase One Burger", description: "Test", price: 20, category: "Food", image: "/burger.jpg", customization: { enabled: true, groups: [] } });
  const sauce = await MenuAddOn.create({ name: "Sauce", price: 3, isActive: true, menuItems: [item._id] });
  item.customization.groups = [{ name: "Sauce choice", selectionType: "single", minSelections: 1, maxSelections: 1, addOns: [sauce._id] }];
  await item.save();
  await InventoryRecipe.create({ menuItem: item._id, doNotTrack: true, isActive: true, ingredients: [], updatedBy: manager._id });
  await AddOnInventoryRecipe.create({ addOn: sauce._id, doNotTrack: true, ingredients: [], updatedBy: manager._id });
  const configuredItem = { productId: item._id, productType: "menuItem", quantity: 1, customization: { selectedAddOns: [{ id: sauce._id, quantity: 1 }], note: "No onion" } };
  await assert.rejects(resolveCartLines([{ productId: item._id, quantity: 1 }]), /Choose at least 1 option/);
  const merged = await resolveCartLines([configuredItem, configuredItem]);
  assert.equal(merged.length, 1); assert.equal(merged[0].quantity, 2); assert.equal(merged[0].unitPrice, 23); assert.equal(merged[0].customization.note, "No onion");

  const created = await invoke(createHeldSale, cashier, { items: [configuredItem], orderType: "takeaway", customer: { name: "Walk In", phone: "+966500000000", pickupNote: "Call name" }, discount: { type: "percentage", value: 20, reason: "Service recovery" }, hold: true, label: "Walk In" });
  assert.equal(created.statusCode, 201); assert.equal(created.payload.data.status, "held"); assert.equal(await Order.countDocuments(), 0);
  const draft = created.payload.data;
  const ownList = await invoke(listHeldSales, cashier, {}, {}, {}); assert.equal(ownList.payload.data.length, 1);
  const otherList = await invoke(listHeldSales, otherCashier, {}, {}, {}); assert.equal(otherList.payload.data.length, 0);
  const managerList = await invoke(listHeldSales, manager, {}, {}, {}); assert.equal(managerList.payload.data.length, 1);
  const updated = await invoke(updateHeldSale, cashier, { items: [configuredItem], revision: draft.revision, resume: true, orderType: "takeaway", customer: { name: "Walk In", phone: "+966500000000" }, discount: { type: "percentage", value: 20, reason: "Service recovery" } }, { id: draft._id });
  assert.equal(updated.payload.data.status, "working");
  await assert.rejects(invoke(updateHeldSale, cashier, { items: [configuredItem], revision: draft.revision, discount: { type: "fixed", value: 0 } }, { id: draft._id }), /changed on another device/);

  await assert.rejects(invoke(requestPosDiscountApproval, cashier, { items: [configuredItem], discount: { type: "percentage", value: 20, reason: "Service recovery" }, managerPin: "9999" }), /invalid/i);
  const approved = await invoke(requestPosDiscountApproval, cashier, { items: [configuredItem], discount: { type: "percentage", value: 20, reason: "Service recovery" }, managerPin: pin });
  assert.equal(approved.statusCode, 201); assert.ok(approved.payload.data.token);
  const idempotencyKey = `phase1-${Date.now()}`;
  const saleBody = { idempotencyKey, items: [configuredItem], orderType: "takeaway", paymentMethod: "card", discount: { type: "percentage", value: 20, reason: "Service recovery" }, discountApprovalToken: approved.payload.data.token, customer: { name: "Walk In", phone: "+966500000000", pickupNote: "Call name" }, heldSaleId: draft._id, heldSaleRevision: updated.payload.data.revision, terminal: "MAIN" };
  const completed = await invoke(createPosSale, cashier, saleBody);
  assert.equal(completed.statusCode, 201); assert.equal(completed.payload.data.discountAmount, 4.6); assert.equal(completed.payload.data.customer.name, "Walk In"); assert.ok(completed.payload.data.pickupToken); assert.equal(completed.payload.data.items[0].itemNote, "No onion");
  assert.equal((await PosHeldSale.findById(draft._id)).status, "consumed");
  const retry = await invoke(createPosSale, cashier, saleBody); assert.equal(retry.statusCode, 200); assert.equal(retry.payload.duplicate, true); assert.equal(await Order.countDocuments(), 1);
  assert.ok(await AuditLog.exists({ action: "POS_DISCOUNT_APPLIED", entityId: completed.payload.data._id }));
  console.log("POS Phase 1 integration checks passed");
};

try { await run(); } finally { await mongoose.disconnect(); }
