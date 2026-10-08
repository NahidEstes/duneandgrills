import Order from "../models/Order.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import PosShift from "../models/PosShift.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { getEffectiveRestaurantSettings } from "./restaurantSettingsService.js";
import { orderAttentionFilter } from "./operationalAttentionService.js";
import { invoiceOutstandingAmount, overdueInvoiceFilter } from "./supplierInvoiceHealth.js";
import { expectedCashForShifts } from "./posShiftService.js";
import { toHalala } from "../utils/money.js";
import { ValidationError } from "../utils/inventoryValidation.js";

export const OPERATIONS_LIST_LIMIT = 3;
const limited = async (model, filter, projection, sort) => {
  const [result] = await model.aggregate([
    { $match: filter },
    { $facet: { count: [{ $count: "total" }], items: [{ $sort: sort }, { $limit: OPERATIONS_LIST_LIMIT }, { $project: projection }] } },
  ]);
  return { total: result?.count[0]?.total ?? 0, items: result?.items ?? [], limit: OPERATIONS_LIST_LIMIT };
};

// Each source fails independently. Errors never masquerade as verified zeros.
export async function readOperationalCategory(role, capability, work) {
  if (!hasCapability(role, capability)) return { status: "restricted" };
  try { return { status: "success", ...await work() }; }
  catch { return { status: "unavailable", message: "This source could not be refreshed. Retry operations." }; }
}

export async function getAdminOperations({ role, now = new Date() }) {
  if (!hasCapability(role, CAPABILITIES.ADMIN_DASHBOARD)) {
    const error = new ValidationError("Dashboard access is not permitted"); error.status = 403; throw error;
  }
  // Settings failure is request-level failure; clients keep the last successful snapshot.
  const settings = await getEffectiveRestaurantSettings();
  const orderCategory = category => readOperationalCategory(role, CAPABILITIES.ORDERS_READ_ALL, () => limited(Order,
    orderAttentionFilter(category, settings, now), { orderNumber: 1, createdAt: 1, preparationDueAt: 1 }, { createdAt: 1, _id: 1 }));
  const [pending_age, preparation_overdue, purchase_approval, invoice_review, invoice_overdue, shifts] = await Promise.all([
    orderCategory("pending_age"), orderCategory("preparation_overdue"),
    readOperationalCategory(role, CAPABILITIES.PURCHASE_APPROVE, () => limited(PurchaseOrder, { status: "submitted" }, { orderNumber: 1, submittedAt: 1, createdAt: 1 }, { submittedAt: 1, _id: 1 })),
    readOperationalCategory(role, CAPABILITIES.PAYABLES_APPROVE, () => limited(SupplierInvoice, { status: "review_required" }, { internalReference: 1, updatedAt: 1, createdAt: 1 }, { updatedAt: 1, _id: 1 })),
    readOperationalCategory(role, CAPABILITIES.PAYABLES_READ, async () => {
      const result = await limited(SupplierInvoice, overdueInvoiceFilter(now), { internalReference: 1, dueDate: 1, total: 1, paidAmountHalala: 1 }, { dueDate: 1, _id: 1 });
      return { ...result, items: result.items.map(({ total, paidAmountHalala, ...invoice }) => ({ ...invoice, outstandingAmount: invoiceOutstandingAmount({ total, paidAmountHalala }) })) };
    }),
    readOperationalCategory(role, CAPABILITIES.POS_SHIFT_MANAGE, async () => {
      if (!settings.posShifts.enabled) return { enabled: false };
      const projection = { shiftNumber: 1, cashier: 1, terminal: 1, terminalSnapshot: 1, openedAt: 1, closedAt: 1, openingCashHalala: 1, expectedCashHalala: 1, countedCashHalala: 1, differenceHalala: 1, managerApprovedBy: 1 };
      const [open, closed] = await Promise.all([
        limited(PosShift, { isOpen: true, status: { $in: ["open", "closing", "reopened"] } }, projection, { openedAt: -1, _id: -1 }),
        limited(PosShift, { isOpen: false, status: "closed" }, projection, { closedAt: -1, _id: -1 }),
      ]);
      await PosShift.populate([...open.items, ...closed.items], { path: "cashier", select: "name" });
      const expected = await expectedCashForShifts(open.items);
      const threshold = toHalala(settings.posShifts.varianceThreshold);
      const context = shift => ({ _id: shift._id, shiftNumber: shift.shiftNumber, cashier: shift.cashier?.name || "Cashier unavailable", terminal: shift.terminalSnapshot?.name || shift.terminal, openedAt: shift.openedAt });
      return { enabled: true, limit: OPERATIONS_LIST_LIMIT, openCount: open.total, closedCount: closed.total, varianceThreshold: settings.posShifts.varianceThreshold,
        open: open.items.map(shift => ({ ...context(shift), expectedCash: expected.get(String(shift._id)) == null ? null : expected.get(String(shift._id)) / 100 })),
        closed: closed.items.map(shift => {
          const difference = shift.differenceHalala;
          const exceedsThreshold = difference == null ? null : Math.abs(difference) > threshold;
          return { ...context(shift), closedAt: shift.closedAt,
            expectedCash: shift.expectedCashHalala == null ? null : shift.expectedCashHalala / 100,
            countedCash: shift.countedCashHalala == null ? null : shift.countedCashHalala / 100,
            difference: difference == null ? null : difference / 100,
            varianceStatus: exceedsThreshold == null ? "unavailable" : exceedsThreshold ? (shift.managerApprovedBy ? "approved" : "review_required") : "within_threshold" };
        }),
      };
    }),
  ]);
  return { generatedAt: now, pendingAttentionMinutes: settings.preparation.pendingAttentionMinutes,
    categories: { pending_age, preparation_overdue, purchase_approval, invoice_review, invoice_overdue }, shifts };
}
