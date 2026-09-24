import mongoose from "mongoose";
import InventoryBatch from "../models/InventoryBatch.js";
import InventoryItem from "../models/InventoryItem.js";
import StockTransaction from "../models/StockTransaction.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import {
  consumeInventoryBatches,
  createInventoryBatch,
  ensureLegacyBatch,
  restoreInventoryBatches,
  rollbackBatchChanges,
  updateItemNextExpiry,
} from "./inventoryBatchService.js";
import { nextInventoryReference } from "./inventoryReferenceService.js";
import { recordAuditLog } from "./auditLogService.js";

const INBOUND_TYPES = new Set(["STOCK_IN", "PURCHASE_RECEIPT", "OPENING_BALANCE"]);
const OUTBOUND_TYPES = new Set(["STOCK_OUT", "WASTE", "DAMAGED"]);

export const movementDirection = (movementType) => {
  if (INBOUND_TYPES.has(movementType)) return "in";
  if (OUTBOUND_TYPES.has(movementType)) return "out";
  return "adjustment";
};

const unsupportedTransaction = (error) =>
  error?.code === 20 ||
  error?.code === 251 ||
  /transaction numbers are only allowed|replica set|transactions are not supported/i.test(error?.message || "");

export const runInventoryTransaction = async (work) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (!unsupportedTransaction(error)) throw error;
    const fallbackAllowed = process.env.NODE_ENV !== "production" && process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY === "true";
    if (fallbackAllowed) return work(null);
    const operationalError = new Error("Inventory transaction support is unavailable. Configure a MongoDB replica set before retrying.");
    operationalError.status = 503;
    operationalError.code = "INVENTORY_TRANSACTION_UNAVAILABLE";
    throw operationalError;
  } finally {
    await session.endSession();
  }
};

export const verifyTransactionCapability = async () => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await InventoryItem.findOne().select("_id").session(session);
    });
    return { ready: true, mode: "transactional" };
  } catch (error) {
    if (!unsupportedTransaction(error)) throw error;
    const fallback = process.env.NODE_ENV !== "production" && process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY === "true";
    return { ready: fallback, mode: fallback ? "explicit-non-transactional-development" : "unsupported" };
  } finally {
    await session.endSession();
  }
};

const sessionOptions = (session) => (session ? { session } : {});

export const performStockMovement = async (
  {
    itemId,
    movementType,
    quantity,
    reason,
    notes = "",
    userId,
    allowNegativeStock = false,
    respectItemNegativeStock = true,
    purchaseOrder = null,
    inventoryCount = null,
    order = null,
    unitCost = null,
    expiryDate = null,
    reasonCode = null,
    reference = null,
    occurredAt = null,
    lotNumber = null,
    receivedAt = null,
    supplier = null,
    purchaseQuantity = null,
    purchaseUnit = null,
    conversionFactor = 1,
    restoreAllocations = null,
    sourceDetails = {},
  },
  { session = null } = {}
) => {
  const item = await InventoryItem.findById(itemId).session(session || null);
  if (!item || !item.isActive) throw new ValidationError("Inventory item was not found or is inactive");

  await ensureLegacyBatch(item, session);

  const numericQuantity = Number(quantity);
  let update;
  let stockAfter;
  const direction = movementDirection(movementType);

  if (direction === "adjustment") {
    stockAfter = numericQuantity;
    if (stockAfter < 0 && !(allowNegativeStock || (respectItemNegativeStock && item.allowNegativeStock))) {
      throw new ValidationError("Negative stock is not allowed for this item");
    }
    update = { $set: { currentStock: stockAfter }, $inc: { stockVersion: 1 } };
  } else {
    const delta = direction === "in" ? numericQuantity : -numericQuantity;
    stockAfter = item.currentStock + delta;
    if (stockAfter < 0 && !(allowNegativeStock || (respectItemNegativeStock && item.allowNegativeStock))) {
      throw new ValidationError(`Insufficient stock. ${item.name} has ${item.currentStock} ${item.unit} available`);
    }
    update = { $inc: { currentStock: delta, stockVersion: 1 } };
  }

  if (unitCost != null && direction === "in") update.$set = { ...(update.$set || {}), unitCost: Number(unitCost) };

  const currentVersion = Number(item.stockVersion || 0);
  const filter = {
    _id: item._id,
    currentStock: item.currentStock,
    ...(currentVersion === 0
      ? { $or: [{ stockVersion: 0 }, { stockVersion: { $exists: false } }] }
      : { stockVersion: currentVersion }),
  };
  const updated = await InventoryItem.findOneAndUpdate(filter, update, {
    new: true,
    runValidators: false,
    ...sessionOptions(session),
  });
  if (!updated) throw new ValidationError("Stock changed while this operation was being saved. Please try again");

  let batchChanges = null;
  let createdTransaction = null;
  try {
    const stockDelta = Number((Number(updated.currentStock) - Number(item.currentStock)).toFixed(6));
    if (restoreAllocations?.length && stockDelta > 0) {
      batchChanges = await restoreInventoryBatches({ item, allocations: restoreAllocations }, session);
    } else if (stockDelta > 0) {
      batchChanges = await createInventoryBatch({
        item,
        quantity: stockDelta,
        lotNumber,
        receivedAt: receivedAt || occurredAt,
        expiryDate: item.tracksExpiry ? expiryDate : null,
        unitCost: unitCost == null ? item.unitCost : unitCost,
        supplier,
        purchaseOrder,
        source: direction === "adjustment" ? "ADJUSTMENT" : movementType,
        purchaseQuantity,
        purchaseUnit,
        conversionFactor,
      }, session);
    } else if (stockDelta < 0) {
      batchChanges = await consumeInventoryBatches({ item, quantity: Math.abs(stockDelta) }, session);
    }

    const nextExpiry = item.tracksExpiry ? await updateItemNextExpiry(item._id, session) : null;
    if (String(updated.expiryDate || "") !== String(nextExpiry || "")) {
      updated.expiryDate = nextExpiry;
      await updated.save(sessionOptions(session));
    }

    const transactionReference = reference || await nextInventoryReference(movementType, session);
    const allocatedQuantity = (batchChanges?.allocations || []).reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
    const allocatedCost = (batchChanges?.allocations || []).reduce(
      (sum, allocation) => sum + Number(allocation.quantity || 0) * Number(allocation.unitCost || 0),
      0
    );
    const transactionUnitCost = stockDelta < 0 && allocatedQuantity > 0
      ? Number((allocatedCost / allocatedQuantity).toFixed(6))
      : unitCost == null ? Number(item.unitCost || 0) : Number(unitCost);
    const [transaction] = await StockTransaction.create(
      [
        {
          item: item._id,
          movementType,
          quantity: direction === "adjustment"
            ? Math.abs(Number(updated.currentStock) - Number(item.currentStock))
            : Math.abs(numericQuantity),
          stockBefore: item.currentStock,
          stockAfter: updated.currentStock,
          reason,
          reasonCode,
          notes,
          reference: transactionReference,
          status: "COMPLETED",
          user: userId,
          purchaseOrder,
          inventoryCount,
          order,
          sourceDetails,
          unitCost: transactionUnitCost,
          expiryDate: expiryDate || null,
          purchaseQuantity,
          purchaseUnit,
          conversionFactor,
          batchAllocations: batchChanges?.allocations || [],
          occurredAt: occurredAt || new Date(),
        },
      ],
      sessionOptions(session)
    );
    createdTransaction = transaction;
    if (batchChanges?.createdBatchIds?.length) {
      await InventoryBatch.updateMany(
        { _id: { $in: batchChanges.createdBatchIds } },
        { $set: { sourceTransaction: transaction._id } },
        sessionOptions(session)
      );
    }
    await recordAuditLog({
      actorId: userId,
      action: "INVENTORY_STOCK_MOVEMENT",
      entityType: "InventoryItem",
      entityId: item._id,
      entityLabel: `${item.name} · ${transaction.reference}`,
      before: { currentStock: item.currentStock, unitCost: item.unitCost, expiryDate: item.expiryDate },
      after: { currentStock: updated.currentStock, unitCost: updated.unitCost, expiryDate: updated.expiryDate },
      metadata: {
        movementType,
        quantity: transaction.quantity,
        reference: transaction.reference,
        reason,
        batchAllocations: transaction.batchAllocations,
        sourceDetails,
      },
    }, { session });
    for (const batchId of batchChanges?.createdBatchIds || []) {
      const allocation = (batchChanges.allocations || []).find((entry) => String(entry.batch) === String(batchId));
      await recordAuditLog({ actorId: userId, action: "INVENTORY_BATCH_CREATED", entityType: "InventoryBatch", entityId: batchId, entityLabel: allocation?.lotNumber || transaction.reference, after: allocation || {}, related: { item: item._id, movement: transaction._id, purchaseOrder, order } }, { session });
    }
    if (stockDelta < 0 && batchChanges?.allocations?.length) {
      for (const allocation of batchChanges.allocations) {
        await recordAuditLog({ actorId: userId, action: ["WASTE", "DAMAGED"].includes(movementType) ? "INVENTORY_BATCH_WRITTEN_OFF" : "INVENTORY_BATCH_CONSUMED", entityType: "InventoryBatch", entityId: allocation.batch, entityLabel: allocation.lotNumber, after: { quantityConsumed: allocation.quantity, unitCost: allocation.unitCost }, reason, related: { item: item._id, movement: transaction._id, order } }, { session });
      }
    }
    return { item: updated, transaction };
  } catch (error) {
    if (!session) {
      if (createdTransaction) await StockTransaction.deleteOne({ _id: createdTransaction._id });
      await rollbackBatchChanges(batchChanges);
      await InventoryItem.updateOne(
        { _id: item._id, currentStock: updated.currentStock },
        { $set: { currentStock: item.currentStock, stockVersion: item.stockVersion, unitCost: item.unitCost, expiryDate: item.expiryDate } }
      );
    }
    throw error;
  }
};

export const createOpeningBalance = async (item, openingStock, userId, session = null) => {
  if (!(Number(openingStock) > 0)) return null;
  return performStockMovement(
    {
      itemId: item._id,
      movementType: "OPENING_BALANCE",
      quantity: Number(openingStock),
      reason: "Opening balance",
      notes: "Initial stock recorded when the inventory item was created.",
      userId,
      unitCost: item.unitCost,
      expiryDate: item.expiryDate,
      lotNumber: `OPENING-${item.sku}`,
      purchaseQuantity: Number(openingStock),
      purchaseUnit: item.unit,
      conversionFactor: 1,
    },
    { session }
  );
};
