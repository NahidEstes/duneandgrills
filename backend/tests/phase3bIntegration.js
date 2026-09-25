import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";
import InventoryBatch from "../models/InventoryBatch.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchasePriceHistory from "../models/PurchasePriceHistory.js";
import PurchasingAction from "../models/PurchasingAction.js";
import ReorderSuggestion from "../models/ReorderSuggestion.js";
import StockTransaction from "../models/StockTransaction.js";
import Supplier from "../models/Supplier.js";
import User from "../models/User.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { generateDraftPurchaseOrders, recalculateAllSuggestions, recalculateItemSuggestion } from "../services/reorderService.js";
import { refreshPurchasingActions } from "../services/purchasingActionService.js";
import { transitionPurchaseOrder } from "../services/purchaseOrderService.js";

process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "true";
const uri = process.env.MONGO_TEST_URI || "mongodb://127.0.0.1:27017/duneandgrills_phase3b_test";
const policy = { purchaseApprovalThreshold: 1000, priceAlertPercent: 10, priceAlertAmount: 5, blockPriceIncrease: false };

const createPrice = (item, supplier, amount, suffix) => PurchasePriceHistory.create({ item: item._id, sku: item.sku, supplier: supplier._id, quantity: 1, unit: item.purchaseUnit, conversionFactor: item.purchaseConversionFactor, unitPrice: amount, baseUnitPrice: amount / item.purchaseConversionFactor, priceType: "approved", effectiveAt: new Date(), lifecycleKey: `phase3b:${suffix}` });

const run = async () => {
  await mongoose.connect(uri); if (!mongoose.connection.db.databaseName.endsWith("_test")) throw new Error("Refusing non-test database"); await mongoose.connection.dropDatabase();
  const manager = await User.create({ name: "Phase 3B Manager", email: "phase3b-manager@example.com", password: "TestPassword123!", role: "manager" });
  const category = await InventoryCategory.create({ name: "Automation Ingredients", skuPrefix: "AUTO" });
  const supplierA = await Supplier.create({ code: "AUTO-A", name: "Automation Supplier A", leadTimeDays: 4 });
  const supplierB = await Supplier.create({ code: "AUTO-B", name: "Automation Supplier B", leadTimeDays: 6 });
  const defaults = { category: category._id, unit: "pcs", purchaseUnit: "case", purchaseConversionFactor: 10, currentStock: 0, reorderEnabled: true, reorderLevel: 30, targetStock: 50, safetyStock: 5, minimumOrderQuantity: 2, orderMultiple: 2 };
  const [itemA, itemB, itemC, itemD] = await InventoryItem.create([{ ...defaults, name: "Automation A", sku: "INV-AUTO-001", supplier: supplierA._id }, { ...defaults, name: "Automation B", sku: "INV-AUTO-002", supplier: supplierA._id }, { ...defaults, name: "Automation C", sku: "INV-AUTO-003", supplier: supplierB._id }, { ...defaults, name: "Automation Missing Supplier", sku: "INV-AUTO-004", supplier: null }]);
  await Promise.all([createPrice(itemA, supplierA, 20, "a"), createPrice(itemB, supplierA, 25, "b"), createPrice(itemC, supplierB, 30, "c")]);
  await InventoryBatch.create([{ item: itemA._id, lotNumber: "EXPIRED", receivedQuantity: 100, remainingQuantity: 100, expiryDate: new Date("2020-01-01"), fefoDate: new Date("2020-01-01"), unitCost: 2, supplier: supplierA._id, source: "LEGACY" }, { item: itemA._id, lotNumber: "QUARANTINE", receivedQuantity: 50, remainingQuantity: 50, unitCost: 2, supplier: supplierA._id, source: "LEGACY", qualityStatus: "quarantined" }, { item: itemA._id, lotNumber: "USABLE", receivedQuantity: 5, remainingQuantity: 5, unitCost: 2, supplier: supplierA._id, source: "LEGACY", qualityStatus: "usable" }]);
  const inbound = await PurchaseOrder.create({ orderNumber: "PO-TEST-INBOUND", supplier: supplierA._id, status: "partially_received", items: [{ item: itemA._id, itemName: itemA.name, sku: itemA.sku, quantity: 3, receivedQuantity: 1, unitCost: 20, purchaseUnit: "case", baseUnit: "pcs", conversionFactor: 10 }], subtotal: 60, total: 60, createdBy: manager._id, updatedBy: manager._id });
  await PurchaseOrder.create({ orderNumber: "PO-TEST-DRAFT", supplier: supplierA._id, status: "draft", items: [{ item: itemA._id, itemName: itemA.name, sku: itemA.sku, quantity: 99, unitCost: 20, purchaseUnit: "case", baseUnit: "pcs", conversionFactor: 10 }], subtotal: 1980, total: 1980, createdBy: manager._id, updatedBy: manager._id });
  for (let index = 0; index < 3; index += 1) await StockTransaction.create({ item: itemA._id, movementType: "STOCK_OUT", quantity: 3, stockBefore: 10 - index * 3, stockAfter: 7 - index * 3, reason: "Recipe consumption", order: new mongoose.Types.ObjectId(), occurredAt: new Date(Date.now() - index * 86400000) });
  await StockTransaction.create({ item: itemA._id, movementType: "WASTE", quantity: 100, stockBefore: 100, stockAfter: 0, reason: "Waste excluded from demand" });
  const suggestionA = await recalculateItemSuggestion(itemA._id); assert.equal(suggestionA.breakdown.usableOnHand, 5); assert.equal(suggestionA.breakdown.confirmedInbound, 20); assert.equal(suggestionA.breakdown.usageQuantity, 9); assert.equal(suggestionA.breakdown.reservedQuantity, 0); assert.ok(suggestionA.suggestedQuantity > 0);
  await recalculateItemSuggestion(itemA._id); assert.equal(await ReorderSuggestion.countDocuments({ item: itemA._id }), 1, "recalculation must not duplicate suggestions");
  await recalculateAllSuggestions({ actor: manager });
  const suggestions = await ReorderSuggestion.find({ item: { $in: [itemA._id, itemB._id, itemC._id] }, status: "open" }); assert.equal(suggestions.length, 3);
  const missingSuggestion = await ReorderSuggestion.findOne({ item: itemD._id }); assert.ok(missingSuggestion.warnings.includes("MISSING_PREFERRED_SUPPLIER")); assert.ok(missingSuggestion.warnings.includes("MISSING_PURCHASE_PRICE"));
  const poCountBeforeFailure = await PurchaseOrder.countDocuments({ automationRun: { $ne: null } }); await assert.rejects(generateDraftPurchaseOrders({ suggestionIds: [suggestions[0]._id, missingSuggestion._id], idempotencyKey: "phase3b-rollback", actor: manager, purchaseSettings: policy }), /active supplier/); assert.equal(await PurchaseOrder.countDocuments({ automationRun: { $ne: null } }), poCountBeforeFailure, "failed generation must not create a partial PO");
  await InventoryItem.updateOne({ _id: itemA._id }, { $inc: { stockVersion: 1 } }); await assert.rejects(generateDraftPurchaseOrders({ suggestionIds: [suggestions.find((row) => String(row.item) === String(itemA._id))._id], idempotencyKey: "phase3b-stale", actor: manager, purchaseSettings: policy }), /stale/); await recalculateItemSuggestion(itemA._id);
  const refreshedSuggestions = await ReorderSuggestion.find({ item: { $in: [itemA._id, itemB._id, itemC._id] }, status: "open" });
  const generated = await generateDraftPurchaseOrders({ suggestionIds: refreshedSuggestions.map((row) => row._id), idempotencyKey: "phase3b-generate-1", actor: manager, purchaseSettings: policy });
  assert.equal(generated.purchaseOrders.length, 2, "different suppliers must create separate POs"); assert.ok(generated.purchaseOrders.every((po) => po.status === "draft")); assert.equal(generated.purchaseOrders.find((po) => String(po.supplier) === String(supplierA._id)).items.length, 2, "same supplier items must be grouped");
  const [retry, concurrentRetry] = await Promise.all([generateDraftPurchaseOrders({ suggestionIds: refreshedSuggestions.map((row) => row._id), idempotencyKey: "phase3b-generate-1", actor: manager, purchaseSettings: policy }), generateDraftPurchaseOrders({ suggestionIds: refreshedSuggestions.map((row) => row._id), idempotencyKey: "phase3b-generate-1", actor: manager, purchaseSettings: policy })]); assert.equal(retry.duplicate, true); assert.equal(concurrentRetry.duplicate, true); assert.equal(await PurchaseOrder.countDocuments({ automationRun: generated.run._id }), 2);
  await recalculateItemSuggestion(itemB._id); assert.equal((await ReorderSuggestion.findOne({ item: itemB._id })).status, "converted", "unchanged converted shortage must not silently reopen"); await InventoryItem.updateOne({ _id: itemB._id }, { $inc: { stockVersion: 1 } }); await recalculateItemSuggestion(itemB._id); assert.equal((await ReorderSuggestion.findOne({ item: itemB._id })).status, "open", "a changed shortage may reopen a converted suggestion");
  const generatedPo = generated.purchaseOrders[0]; await transitionPurchaseOrder({ id: generatedPo._id, target: "submitted", actor: manager, settings: policy }); assert.equal((await PurchaseOrder.findById(generatedPo._id)).status, "submitted", "generated PO must use Phase 3A workflow");
  await refreshPurchasingActions({ actor: manager }); const count = await PurchasingAction.countDocuments(); await refreshPurchasingActions({ actor: manager }); assert.equal(await PurchasingAction.countDocuments(), count, "action refresh must deduplicate");
  const action = await PurchasingAction.findOne({ state: "open" }); action.state = "snoozed"; action.snoozedUntil = new Date(Date.now() - 1000); await action.save(); await refreshPurchasingActions({ actor: manager }); assert.equal((await PurchasingAction.findById(action._id)).state, "open", "expired snooze must reopen");
  await PurchaseOrder.updateOne({ _id: inbound._id }, { status: "received" }); await InventoryItem.updateMany({}, { reorderEnabled: false }); await ReorderSuggestion.updateMany({}, { status: "resolved" }); await refreshPurchasingActions({ actor: manager }); assert.ok(await PurchasingAction.countDocuments({ state: "resolved" }) > 0, "cleared conditions must resolve actions");
  assert.equal(hasCapability("manager", CAPABILITIES.PURCHASE_AUTOMATE), true); assert.equal(hasCapability("inventory", CAPABILITIES.PURCHASE_AUTOMATE), false); assert.equal(hasCapability("accountant", CAPABILITIES.REORDER_MANAGE), false); assert.ok(await AuditLog.countDocuments({ action: { $in: ["REORDER_SUGGESTIONS_RECALCULATED", "REORDER_DRAFT_POS_GENERATED", "PURCHASING_ACTIONS_REFRESHED"] } }) >= 3);
  console.log("Phase 3B purchasing automation integration checks passed");
};

try { await run(); } finally { await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); }
