import PurchaseOrder from "../models/PurchaseOrder.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { purchaseQuantity, purchasingManager, requirePurchasingTransaction } from "./purchasingSafetyService.js";

// Drafts are proposals, not commitments. Disputes hold their reservation until explicitly voided.
export const BILLABLE_RESERVATION_STATUSES = Object.freeze(["submitted", "review_required", "approved", "posted", "disputed"]);

export async function lockInvoicePurchaseOrders(ids, session) {
  requirePurchasingTransaction(session);
  // A shared PO write prevents cross-invoice write skew; sorted locking also avoids lock inversion.
  for (const id of [...new Set(ids.map(String))].sort()) {
    const row = await PurchaseOrder.findByIdAndUpdate(id, { $inc: { invoiceMatchVersion: 1 } }, { session });
    if (!row) throw new ValidationError("One or more purchase orders were not found");
  }
}

export async function committedInvoiceQuantities(orderIds, { excludeInvoiceId = null, session = null } = {}) {
  const invoices = await SupplierInvoice.find({
    status: { $in: BILLABLE_RESERVATION_STATUSES }, "items.purchaseOrder": { $in: orderIds },
    ...(excludeInvoiceId ? { _id: { $ne: excludeInvoiceId } } : {}),
  }).select("items").session(session).lean();
  const committed = new Map();
  for (const invoice of invoices) for (const line of invoice.items) {
    const key = `${line.purchaseOrder}:${line.purchaseOrderLine}`;
    committed.set(key, purchaseQuantity((committed.get(key) || 0) + Number(line.quantity)));
  }
  return committed;
}

export function billableLineAvailability(order, line, committed, settings = {}) {
  const committedQuantity = committed.get(`${order._id}:${line._id}`) || 0;
  const receivedQuantity = purchaseQuantity(line.receivedQuantity);
  const toleranceQuantity = purchaseQuantity(Number(line.quantity) * Number(settings.invoiceQuantityTolerancePercent || 0) / 100);
  return {
    purchaseOrder: order._id, purchaseOrderLine: line._id, itemName: line.itemName,
    orderedQuantity: purchaseQuantity(line.quantity), receivedQuantity, committedQuantity, toleranceQuantity,
    remainingBillableQuantity: purchaseQuantity(Math.max(0, receivedQuantity - committedQuantity)),
    maximumBillableQuantity: purchaseQuantity(Math.max(0, receivedQuantity + toleranceQuantity - committedQuantity)),
  };
}

export function validateInvoiceCommitment(summary, actor, reason) {
  if (summary.quantityChecks.some(row => row.exceedsPolicy)) {
    throw new ValidationError("Invoice exceeds remaining billable quantity and configured cumulative tolerance. Reduce quantities or resolve existing invoices; this limit cannot be overridden");
  }
  const exceptions = summary.quantityChecks.filter(row => row.excessQuantity > 0);
  if (exceptions.length && (!purchasingManager(actor) || !String(reason || "").trim())) {
    throw new ValidationError("Over-billing within tolerance requires explicit Manager/Admin authorization and an override reason");
  }
  return exceptions;
}

export function invoiceMatchingPayload(invoice) {
  const items = invoice.items.map(row => typeof row.toObject === "function" ? row.toObject() : row);
  return {
    supplier: invoice.supplier, items,
    // Stored invoice totals already include line adjustments; do not apply them twice on revalidation.
    tax: Math.max(0, Number(invoice.tax) - items.reduce((sum, row) => sum + Number(row.tax || 0), 0)),
    discount: Math.max(0, Number(invoice.discount) - items.reduce((sum, row) => sum + Number(row.discount || 0), 0)),
    additionalCharges: invoice.additionalCharges,
  };
}
