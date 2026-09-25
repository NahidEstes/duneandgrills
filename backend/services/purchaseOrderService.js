import Counter from "../models/Counter.js";
import InventoryItem from "../models/InventoryItem.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import Supplier from "../models/Supplier.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { performStockMovement, runInventoryTransaction } from "./inventoryStockService.js";
import { getPurchaseConfiguration, toBaseQuantity, toBaseUnitCost } from "./inventoryUnitService.js";
import { recordPurchasePrices } from "./purchasePriceService.js";
import { recordAuditLog } from "./auditLogService.js";
import PurchasePriceHistory from "../models/PurchasePriceHistory.js";

const nextNumber = async (session = null) => {
  const year = new Date().getUTCFullYear();
  const counter = await Counter.findOneAndUpdate({ _id: `inventory-po-${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
  return `PO-${year}-${String(counter.seq).padStart(4, "0")}`;
};
const round = (value) => Number(Number(value || 0).toFixed(2));
const snapshot = (po) => ({ supplier: String(po.supplier), items: po.items.map((line) => ({ item: String(line.item), quantity: line.quantity, unitCost: line.unitCost })), tax: po.tax, discount: po.discount, additionalCharges: po.additionalCharges, total: po.total });

const priceWarnings = async (items, settings = {}, session = null) => {
  const warnings = [];
  for (const line of items) {
    const latest = await PurchasePriceHistory.findOne({ item: line.item, priceType: { $in: ["invoiced", "received", "approved"] } }).sort({ effectiveAt: -1 }).session(session || null).lean();
    if (!latest || Number(latest.unitPrice) <= 0) continue;
    const difference = Number(line.unitCost) - Number(latest.unitPrice); const percent = difference / Number(latest.unitPrice) * 100;
    if (difference > Number(settings.priceAlertAmount || 0) && percent > Number(settings.priceAlertPercent || 0)) warnings.push({ item: line.item, itemName: line.itemName, proposedPrice: line.unitCost, previousPrice: latest.unitPrice, difference: round(difference), percent: round(percent), source: latest.priceType });
  }
  return warnings;
};

export const hydratePurchaseLines = async (lines, session = null) => {
  const ids = [...new Set(lines.map((line) => String(line.item)))];
  const items = await InventoryItem.find({ _id: { $in: ids }, isActive: true }).session(session || null);
  const map = new Map(items.map((item) => [String(item._id), item]));
  if (map.size !== ids.length) throw new ValidationError("One or more purchase items are missing or inactive");
  return lines.map((line) => { const item = map.get(String(line.item)); const { baseUnit, purchaseUnit, conversionFactor } = getPurchaseConfiguration(item); return { item: item._id, itemName: item.name, sku: item.sku, quantity: Number(line.quantity), receivedQuantity: Number(line.receivedQuantity) || 0, unitCost: Number(line.unitCost), purchaseUnit, baseUnit, conversionFactor, expiryDate: line.expiryDate || null, reorderSuggestion: line.reorderSuggestion || null, priceSource: line.priceSource || "manual", priceSourceReference: line.priceSourceReference || null }; });
};

export const calculatePurchaseTotals = (items, { tax = 0, discount = 0, additionalCharges = 0 } = {}) => {
  const subtotal = round(items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitCost), 0));
  const normalizedTax = round(tax); const normalizedDiscount = round(discount); const charges = round(additionalCharges);
  if ([normalizedTax, normalizedDiscount, charges].some((value) => value < 0)) throw new ValidationError("Tax, discount and additional charges cannot be negative");
  if (normalizedDiscount > subtotal + normalizedTax + charges) throw new ValidationError("Purchase discount exceeds the payable amount");
  return { subtotal, tax: normalizedTax, discount: normalizedDiscount, additionalCharges: charges, total: round(subtotal + normalizedTax + charges - normalizedDiscount) };
};

export const createPurchaseOrderInSession = async (payload, actor, settings = {}, session = null) => {
  const actorId = actor?._id || actor;
  const supplier = await Supplier.findOne({ _id: payload.supplier, isActive: true }).session(session || null);
  if (!supplier) throw new ValidationError("Supplier was not found or is inactive");
  const items = await hydratePurchaseLines(payload.items, session); const calculated = calculatePurchaseTotals(items, payload); const warnings = await priceWarnings(items, settings, session);
  if (warnings.length && settings.blockPriceIncrease && !payload.priceOverrideReason) throw new ValidationError("Purchase price increase exceeds policy. An override reason is required");
  const [po] = await PurchaseOrder.create([{ orderNumber: await nextNumber(session), supplier: supplier._id, items, ...calculated, notes: payload.notes, expectedAt: payload.expectedAt, status: "draft", priceWarnings: warnings, automationRun: payload.automationRun || null, sourceSuggestions: payload.sourceSuggestions || [], createdBy: actorId, updatedBy: actorId, revisionHistory: [{ revision: 1, action: "created", actor: actorId, at: new Date(), snapshot: calculated, priceOverrideReason: payload.priceOverrideReason || "" }] }], session ? { session } : {});
  await recordPurchasePrices({ purchaseOrder: po, type: "proposed", actorId, session }); return po;
};

export const createPurchaseOrder = async (payload, actor, settings = {}) =>
  runInventoryTransaction((session) => createPurchaseOrderInSession(payload, actor, settings, session));

export const updatePurchaseOrder = async (purchaseOrder, payload, actor, settings = {}) => runInventoryTransaction(async (session) => {
  const actorId = actor?._id || actor;
  const row = await PurchaseOrder.findById(purchaseOrder._id).session(session || null);
  if (!row || ["ordered", "partially_received", "received", "closed_short", "cancelled"].includes(row.status)) throw new ValidationError("This purchase order can no longer be edited");
  const before = snapshot(row);
  if (payload.supplier) { const supplier = await Supplier.findOne({ _id: payload.supplier, isActive: true }).session(session || null); if (!supplier) throw new ValidationError("Supplier was not found or is inactive"); row.supplier = supplier._id; }
  if (payload.items) row.items = await hydratePurchaseLines(payload.items, session);
  for (const field of ["tax", "discount", "additionalCharges", "notes", "expectedAt"]) if (field in payload) row[field] = payload[field];
  Object.assign(row, calculatePurchaseTotals(row.items, row)); row.priceWarnings = await priceWarnings(row.items, settings, session); if (row.priceWarnings.length && settings.blockPriceIncrease && !payload.priceOverrideReason) throw new ValidationError("Purchase price increase exceeds policy. An override reason is required"); const after = snapshot(row); const material = JSON.stringify(before) !== JSON.stringify(after);
  if (material) { row.revision += 1; row.revisionHistory.push({ revision: row.revision, action: "material_edit", actor: actorId, at: new Date(), before, after }); if (["submitted", "approved", "rejected"].includes(row.status)) { row.status = "draft"; row.approvedAt = null; } await recordPurchasePrices({ purchaseOrder: row, type: "proposed", actorId, session }); }
  row.updatedBy = actorId; return row.save({ session: session || undefined });
});

const allowed = { draft: ["submitted", "cancelled"], rejected: ["cancelled"], submitted: ["approved", "rejected", "cancelled"], approved: ["ordered", "cancelled"], ordered: ["cancelled", "closed_short"], partially_received: ["received", "closed_short"] };

export const transitionPurchaseOrder = async ({ id, target, actor, settings, reason = "", externalReference = "", idempotencyKey = "", emergencyOverride = false }) => runInventoryTransaction(async (session) => {
  const po = await PurchaseOrder.findById(id).session(session || null); if (!po) throw new ValidationError("Purchase order was not found");
  if (idempotencyKey && po.transitionKeys.includes(idempotencyKey)) return { po, duplicate: true };
  if (!allowed[po.status]?.includes(target)) throw new ValidationError(`Cannot change ${po.status} purchase order to ${target}`);
  const from = po.status; const note = String(reason || "").trim();
  if (["rejected", "cancelled", "closed_short"].includes(target) && !note) throw new ValidationError(`${target.replace("_", " ")} reason is required`);
  if (["approved", "rejected"].includes(target) && !["admin", "manager"].includes(actor.role)) throw new ValidationError("Manager or Admin approval is required");
  if (target === "approved") {
    const threshold = Number(settings.purchaseApprovalThreshold || 0); if (po.total > threshold && actor.role !== "admin") throw new ValidationError("Admin approval is required above the purchase threshold");
    const selfApproval = String(po.createdBy) === String(actor._id); if (selfApproval && po.total > threshold && !(actor.role === "admin" && emergencyOverride && note)) throw new ValidationError("Requester cannot approve their own high-value purchase without an Admin emergency override reason");
    po.approvals.push({ approver: actor._id, role: actor.role, decision: "approved", threshold, amount: po.total, emergencyOverride: Boolean(emergencyOverride), note, at: new Date(), revision: po.revision }); po.approvedAt = new Date();
    await recordPurchasePrices({ purchaseOrder: po, type: "approved", actorId: actor._id, session });
  }
  if (target === "rejected") { if (!note) throw new ValidationError("Rejection reason is required"); po.approvals.push({ approver: actor._id, role: actor.role, decision: "rejected", amount: po.total, note, at: new Date(), revision: po.revision }); po.rejectedAt = new Date(); }
  if (target === "submitted") po.submittedAt = new Date(); if (target === "ordered") { po.orderedAt = new Date(); po.externalId = externalReference || po.externalId; } if (["cancelled", "closed_short"].includes(target)) po.closedAt = new Date();
  po.status = target; po.statusVersion += 1; po.updatedBy = actor._id; if (idempotencyKey) po.transitionKeys.push(idempotencyKey); po.revisionHistory.push({ revision: po.revision, action: `${from}_to_${target}`, actor: actor._id, at: new Date(), reason: note }); await po.save({ session: session || undefined });
  await recordAuditLog({ actor, action: `PURCHASE_ORDER_${target.toUpperCase()}`, entityType: "PurchaseOrder", entityId: po._id, entityLabel: po.orderNumber, reason: note, before: { status: from }, after: { status: target, revision: po.revision }, metadata: { emergencyOverride: Boolean(emergencyOverride), externalReference } }, { session });
  return { po, duplicate: false, from };
});

export const receivePurchaseOrder = async (purchaseOrderId, receiptLines, actor, notes = "", settings = {}, idempotencyKey = "") => runInventoryTransaction(async (session) => {
  const actorId = actor?._id || actor;
  const order = await PurchaseOrder.findById(purchaseOrderId).session(session || null); if (!order) throw new ValidationError("Purchase order was not found"); if (!["ordered", "partially_received"].includes(order.status)) throw new ValidationError("Only ordered purchase orders can be received"); if (!Array.isArray(receiptLines) || !receiptLines.length) throw new ValidationError("At least one receipt line is required");
  if (idempotencyKey && order.receiptKeys.includes(idempotencyKey)) return { order, movements: [], duplicate: true };
  const lineMap = new Map(order.items.map((line) => [String(line._id), line]));
  for (const receipt of receiptLines) { const line = lineMap.get(String(receipt.lineId)); if (!line) throw new ValidationError("A receipt line does not belong to this purchase order"); const quantity = Number(receipt.quantity); const remaining = line.quantity - line.receivedQuantity; const tolerance = line.quantity * Number(settings.overReceiveTolerancePercent || 0) / 100; if (!Number.isFinite(quantity) || quantity <= 0 || quantity > remaining + tolerance) throw new ValidationError(`Receipt quantity for ${line.itemName} exceeds the allowed remaining quantity`); if (quantity > remaining && (!["admin", "manager"].includes(actor.role) || !String(receipt.overrideReason || notes).trim())) throw new ValidationError("Over-receiving requires Manager/Admin authorization and a reason"); }
  const movements = []; const priceReceipts = [];
  for (const receipt of receiptLines) { const line = lineMap.get(String(receipt.lineId)); const quantity = Number(receipt.quantity); const conversionFactor = Number(line.conversionFactor || 1); const result = await performStockMovement({ itemId: line.item, movementType: "PURCHASE_RECEIPT", quantity: toBaseQuantity(quantity, conversionFactor), reason: `Purchase receipt ${order.orderNumber}`, notes: receipt.notes || notes, userId: actorId, purchaseOrder: order._id, reference: receipt.idempotencyKey ? `${order.orderNumber}:${receipt.idempotencyKey}` : order.orderNumber, unitCost: toBaseUnitCost(line.unitCost, conversionFactor), expiryDate: receipt.expiryDate || line.expiryDate, lotNumber: receipt.lotNumber, receivedAt: receipt.receivedAt, supplier: order.supplier, purchaseQuantity: quantity, purchaseUnit: line.purchaseUnit || line.baseUnit, conversionFactor }, { session }); line.receivedQuantity += quantity; movements.push(result.transaction); priceReceipts.push({ ...receipt, quantity, transaction: result.transaction, receivedAt: receipt.receivedAt || new Date() }); }
  order.status = order.items.every((line) => line.receivedQuantity >= line.quantity) ? "received" : "partially_received"; order.receivedAt = order.status === "received" ? new Date() : null; order.updatedBy = actorId; if (idempotencyKey) order.receiptKeys.push(idempotencyKey); await order.save({ session: session || undefined }); await recordPurchasePrices({ purchaseOrder: order, type: "received", actorId, session, receipts: priceReceipts });
  await recordAuditLog({ actor: actor?._id ? actor : null, actorId, action: order.status === "received" ? "PURCHASE_ORDER_RECEIVED" : "PURCHASE_ORDER_PARTIALLY_RECEIVED", entityType: "PurchaseOrder", entityId: order._id, entityLabel: order.orderNumber, reason: String(notes || "").trim(), after: { status: order.status, receivedLines: priceReceipts.map((row) => ({ lineId: row.lineId, quantity: row.quantity })) }, related: { movements: movements.map((row) => row._id) } }, { session });
  return { order, movements, duplicate: false };
});
