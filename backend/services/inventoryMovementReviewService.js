import { createHash } from "node:crypto";
import InventoryItem from "../models/InventoryItem.js";
import InventoryBatch from "../models/InventoryBatch.js";
import InventoryMovementRequest from "../models/InventoryMovementRequest.js";
import StockTransaction from "../models/StockTransaction.js";
import Supplier from "../models/Supplier.js";
import { performStockMovement, runInventoryTransaction } from "./inventoryStockService.js";
import { getPurchaseConfiguration, toBaseQuantity, toBaseUnitCost } from "./inventoryUnitService.js";
import { validateMovementPayload, validateWastePayload, ValidationError } from "../utils/inventoryValidation.js";
import { hasCapability, CAPABILITIES } from "../config/permissions.js";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const conflict = message => Object.assign(new ValidationError(message), { status: 409 });
const permission = actor => { if (!hasCapability(actor?.role, CAPABILITIES.INVENTORY_WRITE)) throw Object.assign(new Error("Inventory write permission required"), { status: 403 }); };
function normalized(body, actor) {
  permission(actor);
  if (body.purchaseOrder || body.order || body.inventoryCount) throw new ValidationError("Use the linked purchase receipt, order or inventory count workflow");
  const kind = body.kind || "movement";
  if (!["movement", "waste"].includes(kind)) throw new ValidationError("Unknown stock action");
  const payload = kind === "waste" ? validateWastePayload({ ...body, occurredAt: body.occurredAt || "" }) : validateMovementPayload(body);
  if (kind === "waste" && !body.occurredAt) payload.occurredAt = null;
  if (kind === "movement" && !["STOCK_IN", "STOCK_OUT", "ADJUSTMENT", "WASTE", "DAMAGED"].includes(payload.movementType)) throw new ValidationError("Use the dedicated workflow for this movement type");
  if ((payload.allowNegativeStock || payload.movementType === "ADJUSTMENT") && !hasCapability(actor.role, CAPABILITIES.INVENTORY_COUNT_APPROVE)) throw Object.assign(new Error("Manager inventory approval permission required"), { status: 403 });
  if (payload.quantity > 1e9 || Number(payload.quantity.toFixed(6)) !== payload.quantity) throw new ValidationError("Quantity must fit six-decimal precision and be at most 1,000,000,000");
  if (payload.reason.length > 160 || payload.notes.length > 500) throw new ValidationError("Reason or notes are too long");
  return { kind, ...payload };
}
async function planFor(body, actor, session = null) {
  const payload = normalized(body, actor);
  const item = await InventoryItem.findById(payload.item).session(session).lean();
  if (!item?.isActive) throw new ValidationError("Inventory item was not found or is inactive");
  if (payload.supplier && !await Supplier.exists({ _id: payload.supplier, isActive: true }).session(session)) throw new ValidationError("Supplier was not found or is inactive");
  const config = getPurchaseConfiguration(item), inbound = payload.movementType === "STOCK_IN";
  const quantity = inbound ? toBaseQuantity(payload.quantity, config.conversionFactor) : payload.quantity;
  if (payload.movementType !== "ADJUSTMENT" && (!(quantity >= 0.000001) || quantity > 1e9)) throw new ValidationError("Converted quantity must fit six-decimal inventory precision");
  const stockAfter = Number((payload.movementType === "ADJUSTMENT" ? quantity : item.currentStock + (inbound ? quantity : -quantity)).toFixed(6));
  const allowNegative = payload.kind !== "waste" && (payload.allowNegativeStock || item.allowNegativeStock);
  if (stockAfter < 0 && !allowNegative) throw new ValidationError("Insufficient physical stock. Reduce the quantity or review this item.");
  if (inbound && item.tracksExpiry && !payload.expiryDate) throw new ValidationError("An expiry date is required for this item");
  const batches = await InventoryBatch.find({ item: item._id }).select("remainingQuantity receivedQuantity receivedAt fefoDate expiryDate qualityStatus unitCost lotNumber brand supplier isLegacy").sort({ _id: 1 }).session(session).lean();
  const deduction = Number((item.currentStock - stockAfter).toFixed(6));
  if (deduction > 0 && batches.length && Number(batches.reduce((sum, batch) => sum + batch.remainingQuantity, 0).toFixed(6)) < deduction) throw new ValidationError("Saved batch balances cannot cover this deduction. Reconcile the batch evidence before continuing.");
  const fingerprint = hash({ payload, item: { id: item._id, name: item.name, sku: item.sku, currentStock: item.currentStock, stockVersion: item.stockVersion || 0, isActive: item.isActive, unitCost: item.unitCost, tracksExpiry: item.tracksExpiry, expiryDate: item.expiryDate, allowNegativeStock: item.allowNegativeStock, supplier: item.supplier, ...config }, batches });
  return { payload, item, config, quantity, inbound, fingerprint, summary: { itemId: item._id, name: item.name, unit: item.unit, purchaseUnit: inbound ? config.purchaseUnit : item.unit, enteredQuantity: payload.quantity, baseQuantity: quantity, stockBefore: item.currentStock, stockAfter, movementType: payload.movementType, fingerprint } };
}
export async function previewStockAction(actor, body) { return (await planFor(body, actor)).summary; }
export async function findStockAction(actor, key) {
  permission(actor);
  const saved = await InventoryMovementRequest.findOne({ key, actor: actor._id }).lean();
  return saved ? StockTransaction.findById(saved.transaction).populate("item", "name sku unit").lean() : null;
}
export async function confirmStockAction(actor, body) {
  permission(actor);
  if (typeof body.idempotencyKey !== "string" || !/^[\w-]{16,100}$/.test(body.idempotencyKey)) throw new ValidationError("A valid stock request key is required");
  // Hash only intentional normalized fields, preserving exact retries including
  // server-default dates. Never default a request date to 'now' in this hash.
  const raw = { ...body }; delete raw.idempotencyKey;
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  const requestHash = hash(stable(raw));
  const replay = async saved => {
    if (String(saved.actor) !== String(actor._id) || saved.requestHash !== requestHash) throw conflict("This request key belongs to different stock details. Check the saved result.");
    return StockTransaction.findById(saved.transaction).populate("item", "name sku unit").lean();
  };
  const previous = await InventoryMovementRequest.findOne({ key: body.idempotencyKey }).lean();
  if (previous) return replay(previous);
  const indexes = await InventoryMovementRequest.collection.indexes().catch(() => []);
  if (!indexes.some(index => index.unique && !index.partialFilterExpression && index.key?.key === 1 && Object.keys(index.key).length === 1)) throw Object.assign(new Error("Safe stock request indexing is unavailable. Ask an administrator to provision the inventory movement request key index before retrying."), { status: 503 });
  try { return await runInventoryTransaction(async session => {
    const saved = await InventoryMovementRequest.findOne({ key: body.idempotencyKey }).session(session).lean();
    if (saved) return replay(saved);
    const plan = await planFor(body, actor, session);
    if (plan.fingerprint !== body.previewFingerprint) throw conflict("Stock, batch evidence or item configuration changed since review. Check the saved result, then review again using the same key.");
    const p = plan.payload;
    const result = await performStockMovement({ itemId: p.item, movementType: p.movementType, quantity: plan.quantity, reason: p.reason, reasonCode: p.reasonCode || null, notes: p.notes, userId: actor._id,
      allowNegativeStock: p.allowNegativeStock || false, respectItemNegativeStock: p.kind !== "waste", unitCost: plan.inbound && p.unitCost != null ? toBaseUnitCost(p.unitCost, plan.config.conversionFactor) : null,
      expiryDate: p.expiryDate, lotNumber: p.lotNumber, receivedAt: p.receivedAt, occurredAt: p.occurredAt, supplier: p.supplier || plan.item.supplier,
      purchaseQuantity: plan.inbound ? p.quantity : null, purchaseUnit: plan.inbound ? plan.config.purchaseUnit : null, conversionFactor: plan.inbound ? plan.config.conversionFactor : 1,
      sourceDetails: { kind: "reviewed_manual_stock", baseUnit: plan.item.unit, itemName: plan.item.name },
    }, { session });
    await InventoryMovementRequest.create([{ key: body.idempotencyKey, actor: actor._id, requestHash, transaction: result.transaction._id }], { session });
    return (await result.transaction.populate("item", "name sku unit")).toObject();
  }, { requireTransaction: true }); } catch (error) {
    if (error.code === 11000) { const saved = await InventoryMovementRequest.findOne({ key: body.idempotencyKey }).lean(); if (saved) return replay(saved); }
    throw error;
  }
}
