import { toRiyadhDateKey } from "../utils/adminDate.js";

export const invoiceOutstandingAmount = invoice => Math.max(0, Math.round((Number(invoice.total) - Number(invoice.paidAmountHalala || 0) / 100) * 100) / 100);
export const invoiceIsOverdue = (invoice, now = new Date()) => invoice.status === "posted" && invoiceOutstandingAmount(invoice) > 0 && invoice.dueDate != null && toRiyadhDateKey(invoice.dueDate) < toRiyadhDateKey(now);

// Due dates are Riyadh calendar days, inclusive through the end of that day.
export const overdueInvoiceFilter = (now = new Date()) => ({
  status: "posted",
  dueDate: { $ne: null },
  $expr: { $and: [
    { $lt: [{ $dateToString: { date: "$dueDate", format: "%Y-%m-%d", timezone: "Asia/Riyadh" } }, toRiyadhDateKey(now)] },
    { $gt: [{ $subtract: [{ $round: [{ $multiply: ["$total", 100] }, 0] }, { $ifNull: ["$paidAmountHalala", 0] }] }, 0] },
  ] },
});
