import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AddOnInventoryRecipe from "../models/AddOnInventoryRecipe.js";
import InventoryBatch from "../models/InventoryBatch.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import MenuAddOn from "../models/MenuAddOn.js";
import MenuItem from "../models/MenuItem.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { performStockMovement } from "../services/inventoryStockService.js";
import { deductOrderInventory } from "../services/orderInventoryService.js";
import { buildInventoryValuation } from "../services/inventoryValuationService.js";
import { createRefundRequest, transitionRefund } from "../services/refundService.js";
import { closePosShift, openPosShift, recordPosCashSale, summarizePosShift } from "../services/posShiftService.js";

process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "true";
const uri = process.env.MONGO_TEST_URI || "mongodb://127.0.0.1:27017/duneandgrills_phase2_test";

const run = async () => {
  await mongoose.connect(uri);
  if (!mongoose.connection.db.databaseName.endsWith("_test")) throw new Error("Refusing to use a non-test database");
  await mongoose.connection.dropDatabase();
  const actor = await User.create({ name: "Phase Two Admin", email: "phase2@example.com", password: "TestPassword123!", role: "admin" });
  const category = await InventoryCategory.create({ name: "Phase Two Stock", skuPrefix: "P2" });
  const ingredient = await InventoryItem.create({ name: "Batch Ingredient", sku: "INV-P2-001", category: category._id, unit: "kg", unitCost: 20 });
  await performStockMovement({ itemId: ingredient._id, movementType: "STOCK_IN", quantity: 10, unitCost: 20, lotNumber: "LOT-A", expiryDate: "2026-10-01", reason: "Test batch A", userId: actor._id });
  await performStockMovement({ itemId: ingredient._id, movementType: "STOCK_IN", quantity: 10, unitCost: 25, lotNumber: "LOT-B", expiryDate: "2026-11-01", reason: "Test batch B", userId: actor._id });

  const menuItem = await MenuItem.create({ name: "Recipe Item", description: "Phase 2", price: 40, category: "Food", image: "/test.jpg", customization: { enabled: true, spice: { enabled: false, options: [] } } });
  const addOn = await MenuAddOn.create({ name: "Double ingredient", price: 5, menuItems: [menuItem._id] });
  await InventoryRecipe.create({ menuItem: menuItem._id, ingredients: [{ inventoryItem: ingredient._id, quantityPerSale: 1, unit: "kg" }], updatedBy: actor._id });
  await AddOnInventoryRecipe.create({ addOn: addOn._id, ingredients: [{ inventoryItem: ingredient._id, quantityPerAddOn: 0.5, unit: "kg" }], updatedBy: actor._id });
  const orderId = new mongoose.Types.ObjectId();
  const catalogLines = [{ productType: "menuItem", product: menuItem, quantity: 2, customization: { selectedAddOns: [{ addOn: addOn._id, name: addOn.name, price: 5, quantity: 2 }] } }];
  const movements = await deductOrderInventory({ catalogLines, orderId, orderNumber: "P2-ADDON-1", source: "pos", actorId: actor._id, strictRecipes: true });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].quantity, 4);
  assert.equal(movements[0].batchAllocations[0].lotNumber, "LOT-A");
  assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 16);
  const retry = await deductOrderInventory({ catalogLines, orderId, orderNumber: "P2-ADDON-1", source: "pos", actorId: actor._id, strictRecipes: true });
  assert.equal(retry.length, 1);
  assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 16);

  const valuation = await buildInventoryValuation({ itemIds: [ingredient._id] });
  assert.equal(valuation.rows[0].inventoryValue, 370);
  assert.equal(valuation.rows[0].valuationMethod, "batch");

  const shift = await openPosShift({ actor, openingCash: 50, terminal: "TEST-1", correlationId: "phase2-test" });
  await assert.rejects(openPosShift({ actor, openingCash: 0, terminal: "TEST-1" }), /already exists/);
  const order = await Order.create({ orderNumber: "P2-PAY-1", source: "pos", createdBy: actor._id, customer: { name: "Walk-in", phone: "N/A" }, items: [{ menuItem: menuItem._id, name: menuItem.name, price: 100, quantity: 1 }], orderType: "dine-in", subtotal: 100, originalSubtotal: 100, totalAmount: 100, paymentMethod: "cash", paymentStatus: "paid", status: "pending", posShift: shift._id });
  await recordPosCashSale({ shift, order, actor });
  const request = await createRefundRequest({ orderId: order._id, payload: { amount: 20, method: "cash", reason: "Customer request", idempotencyKey: "phase2-refund-1" }, actor, correlationId: "phase2-test" });
  const duplicate = await createRefundRequest({ orderId: order._id, payload: { amount: 20, method: "cash", reason: "Customer request", idempotencyKey: "phase2-refund-1" }, actor });
  assert.equal(duplicate.duplicate, true);
  await transitionRefund({ refundId: request.refund._id, action: "approve", payload: {}, actor });
  await transitionRefund({ refundId: request.refund._id, action: "complete", payload: {}, actor });
  const refundedOrder = await Order.findById(order._id);
  assert.equal(refundedOrder.paymentStatus, "partially_refunded");
  assert.equal(refundedOrder.refundedAmount, 20);
  assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 16, "refund must not restore inventory");
  await assert.rejects(createRefundRequest({ orderId: order._id, payload: { amount: 81, reason: "Too much", idempotencyKey: "phase2-refund-over" }, actor }), /remaining refundable/);
  const concurrentOrder = await Order.create({ orderNumber: "P2-PAY-2", source: "pos", createdBy: actor._id, customer: { name: "Walk-in", phone: "N/A" }, items: [{ menuItem: menuItem._id, name: menuItem.name, price: 100, quantity: 1 }], orderType: "takeaway", subtotal: 100, originalSubtotal: 100, totalAmount: 100, paymentMethod: "card", paymentStatus: "paid", status: "pending", posShift: shift._id });
  const concurrentRefunds = await Promise.allSettled([
    createRefundRequest({ orderId: concurrentOrder._id, payload: { amount: 60, method: "card", reason: "Concurrent A", idempotencyKey: "phase2-concurrent-a" }, actor }),
    createRefundRequest({ orderId: concurrentOrder._id, payload: { amount: 60, method: "card", reason: "Concurrent B", idempotencyKey: "phase2-concurrent-b" }, actor }),
  ]);
  assert.equal(concurrentRefunds.filter((result) => result.status === "fulfilled").length, 1, "only one concurrent over-refund reservation may succeed");
  assert.equal((await Order.findById(concurrentOrder._id)).refundReservedHalala, 6000);
  const summary = await summarizePosShift(shift);
  assert.equal(summary.totals.expectedCash, 130);
  const closed = await closePosShift({ shiftId: shift._id, countedCash: 129, note: "One SAR short", idempotencyKey: "phase2-close-1", actor, settings: { varianceThreshold: 0 }, correlationId: "phase2-test" });
  assert.equal(closed.shift.differenceHalala, -100);
  const closeRetry = await closePosShift({ shiftId: shift._id, countedCash: 129, note: "retry", idempotencyKey: "phase2-close-1", actor, settings: { varianceThreshold: 0 } });
  assert.equal(closeRetry.duplicate, true);
  const postCloseCashRefund = await createRefundRequest({ orderId: order._id, payload: { amount: 10, method: "cash", reason: "After close", idempotencyKey: "phase2-refund-after-close" }, actor });
  await transitionRefund({ refundId: postCloseCashRefund.refund._id, action: "approve", payload: {}, actor });
  await assert.rejects(transitionRefund({ refundId: postCloseCashRefund.refund._id, action: "complete", payload: {}, actor }), /Open a POS shift/);

  const missing = await InventoryItem.create({ name: "Missing Cost", sku: "INV-P2-002", category: category._id, unit: "pcs", currentStock: 3, unitCost: 0 });
  const mismatch = await InventoryItem.create({ name: "Mismatch", sku: "INV-P2-003", category: category._id, unit: "kg", currentStock: 5, unitCost: 10 });
  await InventoryBatch.create({ item: mismatch._id, lotNumber: "MISMATCH", receivedQuantity: 2, remainingQuantity: 2, unitCost: 10, source: "LEGACY", isLegacy: true });
  const coverage = await buildInventoryValuation({ itemIds: [missing._id, mismatch._id] });
  assert.equal(coverage.summary.missingCostItems, 1);
  assert.equal(coverage.summary.mismatchWarnings, 1);
  console.log("Phase 2 operational integration checks passed");
};

try { await run(); } finally { await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); }
