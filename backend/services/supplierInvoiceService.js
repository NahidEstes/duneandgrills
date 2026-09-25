import Counter from "../models/Counter.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import Supplier from "../models/Supplier.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import SupplierPayment from "../models/SupplierPayment.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { runInventoryTransaction } from "./inventoryStockService.js";
import { recordAuditLog } from "./auditLogService.js";
import { recordPurchasePrices } from "./purchasePriceService.js";

const round = (value) => Number(Number(value || 0).toFixed(2));
const toHalala = (value) => Math.round(Number(value || 0) * 100);
const normalizeInvoiceNumber = (value) => String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
const nextReference = async (session) => {
  const year = new Date().getUTCFullYear();
  const counter = await Counter.findOneAndUpdate({ _id: `supplier-invoice-${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
  return `SIN-${year}-${String(counter.seq).padStart(5, "0")}`;
};

const validateMoney = (value, label) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) throw new ValidationError(`${label} must be zero or greater`);
  return round(number);
};

export const matchSupplierInvoice = async (payload, settings, session = null) => {
  const supplier = await Supplier.findOne({ _id: payload.supplier, isActive: true }).session(session || null);
  if (!supplier) throw new ValidationError("Supplier was not found or is inactive");
  if (!Array.isArray(payload.items) || !payload.items.length) throw new ValidationError("At least one invoice line is required");
  const poIds = [...new Set(payload.items.map((line) => String(line.purchaseOrder)))];
  const orders = await PurchaseOrder.find({ _id: { $in: poIds } }).session(session || null);
  if (orders.length !== poIds.length) throw new ValidationError("One or more purchase orders were not found");
  const orderMap = new Map(orders.map((row) => [String(row._id), row]));
  const seen = new Set();
  const summary = { matched: 0, warnings: 0, mismatches: 0, messages: [] };
  const items = payload.items.map((input, index) => {
    const order = orderMap.get(String(input.purchaseOrder));
    if (String(order.supplier) !== String(supplier._id)) throw new ValidationError("Invoice supplier must match every linked purchase order");
    const poLine = order.items.id(input.purchaseOrderLine);
    if (!poLine || String(poLine.item) !== String(input.item)) throw new ValidationError(`Invoice line ${index + 1} does not match the selected PO line`);
    const duplicateKey = `${order._id}:${poLine._id}`;
    if (seen.has(duplicateKey)) throw new ValidationError("Duplicate purchase-order line in invoice");
    seen.add(duplicateKey);
    const quantity = Number(input.quantity); const unitPrice = Number(input.unitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new ValidationError(`Invoice line ${index + 1} quantity must be greater than zero`);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new ValidationError(`Invoice line ${index + 1} unit price must be zero or greater`);
    const tax = validateMoney(input.tax, "Line tax"); const discount = validateMoney(input.discount, "Line discount");
    const discrepancies = [];
    const quantityTolerance = Number(poLine.quantity) * Number(settings.invoiceQuantityTolerancePercent || 0) / 100;
    if (Number(poLine.receivedQuantity) <= 0) discrepancies.push("Invoice was submitted before goods were received");
    if (quantity > Number(poLine.receivedQuantity) + quantityTolerance) discrepancies.push(`Invoice quantity exceeds received quantity (${poLine.receivedQuantity})`);
    const difference = Math.abs(unitPrice - Number(poLine.unitCost));
    const percent = Number(poLine.unitCost) > 0 ? difference / Number(poLine.unitCost) * 100 : (difference ? Infinity : 0);
    if (difference > Number(settings.invoicePriceToleranceAmount || 0) && percent > Number(settings.invoicePriceTolerancePercent || 0)) discrepancies.push(`Unit price differs from PO price (${poLine.unitCost} SAR)`);
    const matchStatus = discrepancies.length ? "mismatch" : "matched";
    summary[discrepancies.length ? "mismatches" : "matched"] += 1; summary.messages.push(...discrepancies.map((message) => `${poLine.itemName}: ${message}`));
    const lineTotal = round(quantity * unitPrice + tax - discount);
    if (lineTotal < 0) throw new ValidationError("Line discount cannot exceed its payable amount");
    return { item: poLine.item, purchaseOrder: order._id, purchaseOrderLine: poLine._id, quantity, unit: poLine.purchaseUnit || poLine.baseUnit, conversionFactor: poLine.conversionFactor || 1, unitPrice: round(unitPrice), tax, discount, lineTotal, matchStatus, discrepancies };
  });
  const subtotal = round(items.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0));
  const lineTax = round(items.reduce((sum, row) => sum + row.tax, 0)); const lineDiscount = round(items.reduce((sum, row) => sum + row.discount, 0));
  const tax = round(lineTax + validateMoney(payload.tax, "Tax")); const discount = round(lineDiscount + validateMoney(payload.discount, "Discount")); const additionalCharges = validateMoney(payload.additionalCharges, "Additional charges");
  const expectedTax = round(orders.reduce((sum, row) => sum + Number(row.tax || 0), 0)); const expectedCharges = round(orders.reduce((sum, row) => sum + Number(row.additionalCharges || 0), 0));
  const amountTolerance = Number(settings.invoicePriceToleranceAmount || 0);
  if (Math.abs(tax - expectedTax) > amountTolerance) { summary.mismatches += 1; summary.messages.push(`Invoice tax differs from linked PO tax (${expectedTax} SAR)`); }
  if (Math.abs(additionalCharges - expectedCharges) > amountTolerance) { summary.mismatches += 1; summary.messages.push(`Additional charges differ from linked PO charges (${expectedCharges} SAR)`); }
  const total = round(subtotal + tax + additionalCharges - discount);
  if (total < 0) throw new ValidationError("Invoice discount exceeds the payable amount");
  return { supplier, orders, items, totals: { subtotal, tax, discount, additionalCharges, total }, summary };
};

export const createSupplierInvoice = async (payload, actor, settings) => runInventoryTransaction(async (session) => {
  const normalizedInvoiceNumber = normalizeInvoiceNumber(payload.supplierInvoiceNumber);
  if (!normalizedInvoiceNumber) throw new ValidationError("Supplier invoice number is required");
  if (await SupplierInvoice.exists({ supplier: payload.supplier, normalizedInvoiceNumber }).session(session || null)) throw new ValidationError("This supplier invoice number already exists for the supplier");
  const invoiceDate = new Date(payload.invoiceDate); const dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
  if (Number.isNaN(invoiceDate.getTime()) || (dueDate && Number.isNaN(dueDate.getTime()))) throw new ValidationError("Invoice or due date is invalid");
  const matched = await matchSupplierInvoice(payload, settings, session);
  const [invoice] = await SupplierInvoice.create([{ supplier: matched.supplier._id, supplierInvoiceNumber: String(payload.supplierInvoiceNumber).trim(), normalizedInvoiceNumber, internalReference: await nextReference(session), purchaseOrders: matched.orders.map((row) => row._id), invoiceDate, dueDate, items: matched.items, ...matched.totals, matchSummary: matched.summary, note: String(payload.note || "").trim(), attachment: payload.attachment || null, createdBy: actor._id, updatedBy: actor._id }], session ? { session } : {});
  await recordAuditLog({ actor, action: "SUPPLIER_INVOICE_CREATED", entityType: "SupplierInvoice", entityId: invoice._id, entityLabel: invoice.internalReference, after: { total: invoice.total, status: invoice.status, matchSummary: invoice.matchSummary } }, { session });
  return invoice;
});

export const updateSupplierInvoice = async (id, payload, actor, settings) => runInventoryTransaction(async (session) => {
  const existing = await SupplierInvoice.findById(id).session(session || null);
  if (!existing) throw new ValidationError("Supplier invoice was not found");
  if (!["draft", "review_required"].includes(existing.status)) throw new ValidationError("Only draft or review-required invoices can be edited");
  const merged = { supplier: payload.supplier ?? existing.supplier, supplierInvoiceNumber: payload.supplierInvoiceNumber ?? existing.supplierInvoiceNumber, invoiceDate: payload.invoiceDate ?? existing.invoiceDate, dueDate: payload.dueDate ?? existing.dueDate, items: payload.items ?? existing.items.map((row) => row.toObject()), tax: payload.tax ?? 0, discount: payload.discount ?? 0, additionalCharges: payload.additionalCharges ?? existing.additionalCharges };
  const matched = await matchSupplierInvoice(merged, settings, session);
  existing.set({ supplier: matched.supplier._id, supplierInvoiceNumber: String(merged.supplierInvoiceNumber).trim(), normalizedInvoiceNumber: normalizeInvoiceNumber(merged.supplierInvoiceNumber), purchaseOrders: matched.orders.map((row) => row._id), invoiceDate: new Date(merged.invoiceDate), dueDate: merged.dueDate ? new Date(merged.dueDate) : null, items: matched.items, ...matched.totals, matchSummary: matched.summary, note: payload.note ?? existing.note, updatedBy: actor._id, status: "draft" });
  await existing.save({ session: session || undefined });
  await recordAuditLog({ actor, action: "SUPPLIER_INVOICE_UPDATED", entityType: "SupplierInvoice", entityId: existing._id, entityLabel: existing.internalReference, after: { total: existing.total, matchSummary: existing.matchSummary } }, { session });
  return existing;
});

export const transitionSupplierInvoice = async ({ id, target, actor, settings, reason = "", idempotencyKey = "" }) => runInventoryTransaction(async (session) => {
  const invoice = await SupplierInvoice.findById(id).session(session || null); if (!invoice) throw new ValidationError("Supplier invoice was not found");
  if (idempotencyKey && invoice.transitionKeys.includes(idempotencyKey)) return { invoice, duplicate: true };
  const from = invoice.status; const note = String(reason || "").trim();
  const allowed = { draft: ["submitted", "voided"], review_required: ["approved", "disputed", "voided"], submitted: ["approved", "disputed", "voided"], approved: ["posted", "disputed", "voided"], disputed: ["review_required", "voided"], posted: ["voided"] };
  if (!allowed[from]?.includes(target)) throw new ValidationError(`Cannot change ${from} invoice to ${target}`);
  if (["approved", "posted", "voided", "disputed"].includes(target) && !["admin", "manager"].includes(actor.role)) throw new ValidationError("Manager or Admin authorization is required");
  if (["voided", "disputed"].includes(target) && !note) throw new ValidationError(`${target} reason is required`);
  if (target === "voided" && Number(invoice.paidAmountHalala || 0) > 0) throw new ValidationError("Reverse completed payments before voiding this invoice");
  if (target === "submitted") invoice.status = Number(invoice.matchSummary?.mismatches || 0) ? "review_required" : "submitted";
  else if (target === "approved") { if (Number(invoice.matchSummary?.mismatches || 0) && !note) throw new ValidationError("Mismatch override reason is required"); invoice.status = "approved"; invoice.approvedBy = actor._id; invoice.approvedAmount = invoice.total; }
  else { invoice.status = target; }
  if (target === "posted") { invoice.postedBy = actor._id; invoice.postedAt = new Date(); for (const poId of invoice.purchaseOrders) { const po = await PurchaseOrder.findById(poId).session(session || null); if (po) await recordPurchasePrices({ purchaseOrder: po, type: "invoiced", actorId: actor._id, session, invoice }); } }
  if (idempotencyKey) invoice.transitionKeys.push(idempotencyKey); invoice.updatedBy = actor._id; await invoice.save({ session: session || undefined });
  await recordAuditLog({ actor, action: `SUPPLIER_INVOICE_${invoice.status.toUpperCase()}`, entityType: "SupplierInvoice", entityId: invoice._id, entityLabel: invoice.internalReference, reason: note, before: { status: from }, after: { status: invoice.status, approvedAmount: invoice.approvedAmount }, metadata: { matchSummary: invoice.matchSummary } }, { session });
  return { invoice, duplicate: false };
});

const paymentStatus = (paidHalala, total) => paidHalala <= 0 ? "unpaid" : paidHalala >= toHalala(total) ? "paid" : "partially_paid";
export const recordSupplierPayment = async ({ invoiceId, payload, actor, settings }) => runInventoryTransaction(async (session) => {
  const key = String(payload.idempotencyKey || "").trim(); if (!key) throw new ValidationError("Payment idempotency key is required");
  const prior = await SupplierPayment.findOne({ idempotencyKey: key }).session(session || null); if (prior) return { payment: prior, invoice: await SupplierInvoice.findById(prior.invoice).session(session || null), duplicate: true };
  const amountHalala = toHalala(payload.amount); if (!Number.isInteger(amountHalala) || amountHalala <= 0) throw new ValidationError("Payment amount must be greater than zero");
  if (Number(payload.amount) > Number(settings.largePaymentThreshold || Infinity) && actor.role !== "admin" && actor.role !== "manager") throw new ValidationError("Manager or Admin authorization is required for a large supplier payment");
  const invoice = await SupplierInvoice.findOneAndUpdate({ _id: invoiceId, status: "posted", $expr: { $lte: [{ $add: ["$paidAmountHalala", "$paymentReservedHalala", amountHalala] }, { $multiply: ["$total", 100] }] } }, { $inc: { paymentReservedHalala: amountHalala } }, { new: true, session });
  if (!invoice) throw new ValidationError("Invoice is not posted or payment would exceed its outstanding balance");
  const date = payload.paymentDate ? new Date(payload.paymentDate) : new Date(); if (Number.isNaN(date.getTime())) throw new ValidationError("Payment date is invalid");
  const [payment] = await SupplierPayment.create([{ invoice: invoice._id, supplier: invoice.supplier, amountHalala, method: payload.method, transactionReference: String(payload.transactionReference || "").trim(), paymentDate: date, note: String(payload.note || "").trim(), idempotencyKey: key, createdBy: actor._id }], session ? { session } : {});
  invoice.paymentReservedHalala -= amountHalala; invoice.paidAmountHalala += amountHalala; invoice.paymentStatus = paymentStatus(invoice.paidAmountHalala, invoice.total); await invoice.save({ session: session || undefined });
  await recordAuditLog({ actor, action: "SUPPLIER_PAYMENT_COMPLETED", entityType: "SupplierPayment", entityId: payment._id, entityLabel: invoice.internalReference, after: { amount: amountHalala / 100, method: payment.method, invoicePaymentStatus: invoice.paymentStatus }, related: { invoice: invoice._id, supplier: invoice.supplier } }, { session });
  return { payment, invoice, duplicate: false };
});

export const reverseSupplierPayment = async ({ paymentId, actor, reason }) => runInventoryTransaction(async (session) => {
  const note = String(reason || "").trim(); if (!note) throw new ValidationError("Payment reversal reason is required");
  if (!["admin", "manager"].includes(actor.role)) throw new ValidationError("Manager or Admin authorization is required");
  const payment = await SupplierPayment.findOne({ _id: paymentId, status: "completed" }).session(session || null); if (!payment) throw new ValidationError("Completed supplier payment was not found");
  const invoice = await SupplierInvoice.findById(payment.invoice).session(session || null); if (!invoice) throw new ValidationError("Supplier invoice was not found");
  invoice.paidAmountHalala = Math.max(0, invoice.paidAmountHalala - payment.amountHalala); invoice.paymentStatus = paymentStatus(invoice.paidAmountHalala, invoice.total); await invoice.save({ session: session || undefined });
  payment.status = "reversed"; payment.reversedBy = actor._id; payment.reversedAt = new Date(); payment.reversalReason = note; await payment.save({ session: session || undefined });
  await recordAuditLog({ actor, action: "SUPPLIER_PAYMENT_REVERSED", entityType: "SupplierPayment", entityId: payment._id, entityLabel: invoice.internalReference, reason: note, before: { status: "completed" }, after: { status: "reversed", invoicePaymentStatus: invoice.paymentStatus }, related: { invoice: invoice._id } }, { session });
  return { payment, invoice };
});

export const decorateInvoice = (invoice, now = new Date()) => ({ ...invoice, paidAmount: Number(invoice.paidAmountHalala || 0) / 100, outstandingAmount: Math.max(0, round(Number(invoice.total) - Number(invoice.paidAmountHalala || 0) / 100)), displayPaymentStatus: invoice.paymentStatus !== "paid" && invoice.status === "posted" && invoice.dueDate && new Date(invoice.dueDate) < now ? "overdue" : invoice.paymentStatus });

export const getPayablesAging = async () => {
  const now = new Date(); const rows = await SupplierInvoice.find({ status: "posted", paymentStatus: { $ne: "paid" } }).lean();
  const aging = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0, total: 0 };
  for (const row of rows) { const outstanding = Math.max(0, Number(row.total) - Number(row.paidAmountHalala || 0) / 100); const days = row.dueDate ? Math.floor((now - new Date(row.dueDate)) / 86400000) : -1; const key = days <= 0 ? "current" : days <= 30 ? "days1to30" : days <= 60 ? "days31to60" : days <= 90 ? "days61to90" : "days90plus"; aging[key] = round(aging[key] + outstanding); aging.total = round(aging.total + outstanding); }
  return aging;
};
