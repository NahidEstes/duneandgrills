import InventorySettings from "../models/InventorySettings.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchasingAction from "../models/PurchasingAction.js";
import ReorderSuggestion from "../models/ReorderSuggestion.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import { recordAuditLog } from "./auditLogService.js";

const day = 86400000;
const make = (actionType, severity, entityType, entityId, title, explanation, href, extras = {}) => ({ fingerprint: `${actionType}:${entityId}`, actionType, severity, entityType, entityId, title, explanation, href, ...extras });

export const detectPurchasingActions = async ({ now = new Date() } = {}) => {
  const settings = await InventorySettings.findOne({ key: "default" }).lean();
  const dueSoonAt = new Date(now.getTime() + Number(settings?.purchasingAutomation?.dueSoonDays || 7) * day);
  const [suggestions, purchaseOrders, invoices] = await Promise.all([
    ReorderSuggestion.find({ status: { $in: ["open", "reviewed", "stale"] } }).populate("item", "name sku").lean(),
    PurchaseOrder.find({ status: { $in: ["draft", "submitted", "rejected", "ordered", "partially_received", "closed_short"] } }).select("orderNumber status expectedAt priceWarnings").lean(),
    SupplierInvoice.find({ $or: [{ status: "review_required" }, { status: "posted", paymentStatus: { $ne: "paid" }, dueDate: { $ne: null } }] }).select("internalReference status paymentStatus dueDate total paidAmountHalala").lean(),
  ]);
  const rows = [];
  for (const suggestion of suggestions) {
    const itemName = suggestion.item?.name || "Inventory item";
    if (suggestion.breakdown?.projectedAvailable <= 0) rows.push(make("OUT_OF_STOCK", "critical", "ReorderSuggestion", suggestion._id, `${itemName} is out of stock`, `Projected available stock is ${suggestion.breakdown.projectedAvailable} ${suggestion.breakdown.baseUnit}.`, "/inventory/reorder-suggestions"));
    else if (suggestion.severity === "high") rows.push(make("CRITICAL_LOW_STOCK", "high", "ReorderSuggestion", suggestion._id, `${itemName} is critically low`, "Projected stock is at or below the configured safety stock.", "/inventory/reorder-suggestions"));
    if (suggestion.status === "stale" || suggestion.staleAt <= now) rows.push(make("STALE_REORDER_SUGGESTION", "medium", "ReorderSuggestion", suggestion._id, `${itemName} suggestion is stale`, "Recalculate before creating a draft purchase order.", "/inventory/reorder-suggestions"));
    else rows.push(make("REORDER_REVIEW", suggestion.severity, "ReorderSuggestion", suggestion._id, `Review reorder for ${itemName}`, `Suggested purchase quantity: ${suggestion.reviewedQuantity ?? suggestion.suggestedQuantity} ${suggestion.breakdown?.purchaseUnit || "units"}.`, "/inventory/reorder-suggestions"));
    if (suggestion.warnings?.includes("MISSING_PREFERRED_SUPPLIER")) rows.push(make("MISSING_PREFERRED_SUPPLIER", "high", "ReorderSuggestion", suggestion._id, `${itemName} needs a preferred supplier`, "Assign an active supplier before draft PO generation.", `/inventory/stock-items?edit=${suggestion.item?._id || ""}`));
    if (suggestion.warnings?.some((warning) => ["MISSING_LEAD_TIME", "MISSING_PURCHASE_PRICE"].includes(warning))) rows.push(make("MISSING_PURCHASING_CONFIGURATION", "medium", "ReorderSuggestion", suggestion._id, `${itemName} purchasing setup is incomplete`, suggestion.warnings.filter((warning) => warning.startsWith("MISSING_")).join(", ").replaceAll("_", " ").toLowerCase(), `/inventory/stock-items?edit=${suggestion.item?._id || ""}`));
  }
  for (const po of purchaseOrders) {
    const config = {
      draft: ["DRAFT_PO_REVIEW", "medium", "Draft PO ready for review", "/inventory/purchase-orders"],
      submitted: ["PO_PENDING_APPROVAL", "high", "Purchase order pending approval", "/inventory/purchase-orders"],
      rejected: ["REJECTED_PO_CORRECTION", "high", "Rejected purchase order needs correction", "/inventory/purchase-orders"],
      partially_received: ["PARTIAL_RECEIPT_FOLLOW_UP", "medium", "Partially received PO needs follow-up", "/inventory/purchase-orders"],
      closed_short: ["CLOSED_SHORT_REVIEW", "medium", "Closed-short PO needs review", "/inventory/purchase-orders"],
    }[po.status];
    if (config) rows.push(make(config[0], config[1], "PurchaseOrder", po._id, `${config[2]}: ${po.orderNumber}`, `Current purchase order status is ${po.status.replaceAll("_", " ")}.`, config[3], { dueAt: po.expectedAt }));
    if (["ordered", "partially_received"].includes(po.status) && po.expectedAt && po.expectedAt < now) rows.push(make("SUPPLIER_DELIVERY_OVERDUE", "high", "PurchaseOrder", po._id, `Supplier delivery overdue: ${po.orderNumber}`, `Expected delivery was ${po.expectedAt.toISOString().slice(0, 10)}.`, "/inventory/purchase-orders", { dueAt: po.expectedAt }));
    if (po.priceWarnings?.length) rows.push(make("PURCHASE_PRICE_VARIANCE", "medium", "PurchaseOrder", po._id, `Purchase price variance: ${po.orderNumber}`, `${po.priceWarnings.length} line(s) exceed the configured variance threshold.`, `/inventory/purchase-prices?purchaseOrder=${po._id}`));
  }
  for (const invoice of invoices) {
    if (invoice.status === "review_required") rows.push(make("SUPPLIER_INVOICE_MISMATCH", "high", "SupplierInvoice", invoice._id, `Invoice mismatch: ${invoice.internalReference}`, "Three-way matching found discrepancies requiring review.", "/inventory/supplier-invoices"));
    if (invoice.status === "posted" && invoice.paymentStatus !== "paid" && invoice.dueDate) {
      const overdue = invoice.dueDate < now;
      if (overdue || invoice.dueDate <= dueSoonAt) rows.push(make(overdue ? "PAYABLE_OVERDUE" : "PAYABLE_DUE_SOON", overdue ? "critical" : "medium", "SupplierInvoice", invoice._id, `${overdue ? "Payable overdue" : "Payable due soon"}: ${invoice.internalReference}`, `Outstanding balance is SAR ${(Number(invoice.total) - Number(invoice.paidAmountHalala || 0) / 100).toFixed(2)}.`, "/inventory/supplier-invoices", { dueAt: invoice.dueDate }));
    }
  }
  return rows;
};

export const refreshPurchasingActions = async ({ actor, now = new Date() }) => {
  const detected = await detectPurchasingActions({ now });
  const fingerprints = detected.map((row) => row.fingerprint);
  for (const row of detected) {
    const existing = await PurchasingAction.findOne({ fingerprint: row.fingerprint });
    if (!existing) { await PurchasingAction.create(row); continue; }
    const wasResolved = existing.state === "resolved";
    const snoozeExpired = existing.state === "snoozed" && existing.snoozedUntil <= now;
    Object.assign(existing, row, { lastDetectedAt: now });
    if (wasResolved || snoozeExpired) { existing.state = "open"; existing.resolvedAt = null; existing.resolution = ""; if (wasResolved) existing.occurrenceCount += 1; }
    await existing.save();
  }
  await PurchasingAction.updateMany({ fingerprint: { $nin: fingerprints }, state: { $ne: "resolved" } }, { $set: { state: "resolved", resolvedAt: now, resolution: "Underlying condition cleared automatically" } });
  await recordAuditLog({ actor, action: "PURCHASING_ACTIONS_REFRESHED", entityType: "PurchasingAction", reason: "Manual secured action scan", after: { detected: detected.length, unique: fingerprints.length } });
  return { detected: detected.length };
};
