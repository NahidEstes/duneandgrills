import Counter from "../models/Counter.js";
import InventoryItem from "../models/InventoryItem.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import Supplier from "../models/Supplier.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { performStockMovement, runInventoryTransaction } from "./inventoryStockService.js";

const nextNumber = async () => {
  const year = new Date().getUTCFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `inventory-po-${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `PO-${year}-${String(counter.seq).padStart(4, "0")}`;
};

export const hydratePurchaseLines = async (lines, session = null) => {
  const ids = [...new Set(lines.map((line) => String(line.item)))];
  const items = await InventoryItem.find({ _id: { $in: ids }, isActive: true }).session(session || null);
  const map = new Map(items.map((item) => [String(item._id), item]));
  if (map.size !== ids.length) throw new ValidationError("One or more purchase items are missing or inactive");
  return lines.map((line) => {
    const item = map.get(String(line.item));
    return {
      item: item._id,
      itemName: item.name,
      sku: item.sku,
      quantity: Number(line.quantity),
      receivedQuantity: Number(line.receivedQuantity) || 0,
      unitCost: Number(line.unitCost),
      expiryDate: line.expiryDate || null,
    };
  });
};

const totals = (items, tax = 0) => {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  return { subtotal: Number(subtotal.toFixed(2)), tax: Number(tax), total: Number((subtotal + Number(tax)).toFixed(2)) };
};

export const createPurchaseOrder = async (payload, userId) => {
  if (payload.status && !["draft", "ordered"].includes(payload.status)) {
    throw new ValidationError("New purchase orders must start as draft or ordered");
  }
  const supplier = await Supplier.findOne({ _id: payload.supplier, isActive: true });
  if (!supplier) throw new ValidationError("Supplier was not found or is inactive");
  const items = await hydratePurchaseLines(payload.items);
  const calculated = totals(items, payload.tax);
  return PurchaseOrder.create({
    orderNumber: await nextNumber(),
    supplier: supplier._id,
    items,
    ...calculated,
    notes: payload.notes,
    expectedAt: payload.expectedAt,
    status: payload.status || "draft",
    orderedAt: payload.status === "ordered" ? new Date() : null,
    createdBy: userId,
    updatedBy: userId,
  });
};

export const updatePurchaseOrder = async (purchaseOrder, payload, userId) => {
  if (!["draft", "ordered"].includes(purchaseOrder.status)) {
    throw new ValidationError("Only draft or ordered purchase orders can be edited");
  }
  if (payload.status && !["draft", "ordered"].includes(payload.status)) {
    throw new ValidationError("Use the purchase-order status action for cancellation or receiving");
  }
  if (payload.supplier) {
    const supplier = await Supplier.findOne({ _id: payload.supplier, isActive: true });
    if (!supplier) throw new ValidationError("Supplier was not found or is inactive");
    purchaseOrder.supplier = supplier._id;
  }
  if (payload.items) purchaseOrder.items = await hydratePurchaseLines(payload.items);
  if (payload.tax != null) purchaseOrder.tax = payload.tax;
  if (payload.notes != null) purchaseOrder.notes = payload.notes;
  if ("expectedAt" in payload) purchaseOrder.expectedAt = payload.expectedAt;
  if (payload.status) {
    purchaseOrder.status = payload.status;
    if (payload.status === "ordered" && !purchaseOrder.orderedAt) purchaseOrder.orderedAt = new Date();
  }
  Object.assign(purchaseOrder, totals(purchaseOrder.items, purchaseOrder.tax));
  purchaseOrder.updatedBy = userId;
  return purchaseOrder.save();
};

export const receivePurchaseOrder = async (purchaseOrderId, receiptLines, userId, notes = "") =>
  runInventoryTransaction(async (session) => {
    const order = await PurchaseOrder.findById(purchaseOrderId).session(session || null);
    if (!order) throw new ValidationError("Purchase order was not found");
    if (!["ordered", "partially_received"].includes(order.status)) {
      throw new ValidationError("Only ordered purchase orders can be received");
    }
    if (!Array.isArray(receiptLines) || receiptLines.length === 0) throw new ValidationError("At least one receipt line is required");

    const lineMap = new Map(order.items.map((line) => [String(line._id), line]));
    for (const receipt of receiptLines) {
      const line = lineMap.get(String(receipt.lineId));
      if (!line) throw new ValidationError("A receipt line does not belong to this purchase order");
      const quantity = Number(receipt.quantity);
      const remaining = line.quantity - line.receivedQuantity;
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > remaining) {
        throw new ValidationError(`Receipt quantity for ${line.itemName} must be between 0 and ${remaining}`);
      }
    }

    const movements = [];
    for (const receipt of receiptLines) {
      const line = lineMap.get(String(receipt.lineId));
      const quantity = Number(receipt.quantity);
      const result = await performStockMovement(
        {
          itemId: line.item,
          movementType: "PURCHASE_RECEIPT",
          quantity,
          reason: `Purchase receipt ${order.orderNumber}`,
          notes: receipt.notes || notes,
          userId,
          purchaseOrder: order._id,
          reference: order.orderNumber,
          unitCost: line.unitCost,
          expiryDate: receipt.expiryDate || line.expiryDate,
        },
        { session }
      );
      line.receivedQuantity += quantity;
      movements.push(result.transaction);
    }

    const fullyReceived = order.items.every((line) => line.receivedQuantity >= line.quantity);
    order.status = fullyReceived ? "received" : "partially_received";
    order.receivedAt = fullyReceived ? new Date() : null;
    order.updatedBy = userId;
    await order.save({ session: session || undefined });
    return { order, movements };
  });
