import mongoose from "mongoose";
import InventoryItem from "../models/InventoryItem.js";
import StockTransaction from "../models/StockTransaction.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { nextInventoryReference } from "./inventoryReferenceService.js";

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
    return work(null);
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
    unitCost = null,
    expiryDate = null,
    reasonCode = null,
    reference = null,
    occurredAt = null,
  },
  { session = null } = {}
) => {
  const item = await InventoryItem.findById(itemId).session(session || null);
  if (!item || !item.isActive) throw new ValidationError("Inventory item was not found or is inactive");

  const numericQuantity = Number(quantity);
  let update;
  let stockAfter;
  const direction = movementDirection(movementType);

  if (direction === "adjustment") {
    stockAfter = numericQuantity;
    if (stockAfter < 0 && !(allowNegativeStock || (respectItemNegativeStock && item.allowNegativeStock))) {
      throw new ValidationError("Negative stock is not allowed for this item");
    }
    update = { $set: { currentStock: stockAfter } };
  } else {
    const delta = direction === "in" ? numericQuantity : -numericQuantity;
    stockAfter = item.currentStock + delta;
    if (stockAfter < 0 && !(allowNegativeStock || (respectItemNegativeStock && item.allowNegativeStock))) {
      throw new ValidationError(`Insufficient stock. ${item.name} has ${item.currentStock} ${item.unit} available`);
    }
    update = { $inc: { currentStock: delta } };
  }

  if (unitCost != null && direction === "in") update.$set = { ...(update.$set || {}), unitCost: Number(unitCost) };
  if (expiryDate && item.tracksExpiry) update.$set = { ...(update.$set || {}), expiryDate: new Date(expiryDate) };

  const filter = { _id: item._id, currentStock: item.currentStock };
  const updated = await InventoryItem.findOneAndUpdate(filter, update, {
    new: true,
    runValidators: false,
    ...sessionOptions(session),
  });
  if (!updated) throw new ValidationError("Stock changed while this operation was being saved. Please try again");

  try {
    const transactionReference = reference || await nextInventoryReference(movementType, session);
    const transactionUnitCost = unitCost == null ? Number(item.unitCost || 0) : Number(unitCost);
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
          unitCost: transactionUnitCost,
          expiryDate: expiryDate || null,
          occurredAt: occurredAt || new Date(),
        },
      ],
      sessionOptions(session)
    );
    return { item: updated, transaction };
  } catch (error) {
    if (!session) {
      await InventoryItem.updateOne(
        { _id: item._id, currentStock: updated.currentStock },
        { $set: { currentStock: item.currentStock, unitCost: item.unitCost, expiryDate: item.expiryDate } }
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
    },
    { session }
  );
};
