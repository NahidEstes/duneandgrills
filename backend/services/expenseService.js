import {
  EXPENSE_FREQUENCIES,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_PAYMENT_STATUSES,
  EXPENSE_RECORD_STATUSES,
} from "../config/finance.js";
import Expense from "../models/Expense.js";
import ExpenseCategory from "../models/ExpenseCategory.js";
import RecurringExpense from "../models/RecurringExpense.js";
import { ADMIN_DAY_MS, parseRiyadhDate } from "../utils/adminDate.js";
import { assertObjectId, escapeRegex, ValidationError } from "../utils/inventoryValidation.js";

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const cleanText = (value, maximum = 1000) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const money = (value, label, { minimum = 0 } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) throw new ValidationError(`${label} must be ${minimum > 0 ? "greater than zero" : "zero or greater"}`);
  return Number(parsed.toFixed(2));
};

export const toRiyadhDateKey = (date) => new Date(new Date(date).getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);

export const addRecurringPeriod = (date, frequency) => {
  const months = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const shifted = new Date(new Date(date).getTime() + RIYADH_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const targetFirst = new Date(Date.UTC(year, month + months, 1));
  const lastDay = new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth(), Math.min(day, lastDay)) - RIYADH_OFFSET_MS);
  return target;
};

export const ensureExpenseCategory = async (categoryId, { allowInactive = false } = {}) => {
  assertObjectId(categoryId, "expense category");
  const category = await ExpenseCategory.findById(categoryId);
  if (!category || (!allowInactive && !category.isActive)) throw new ValidationError("Expense category was not found or is inactive");
  return category;
};

const derivePaymentStatus = (amountPaid, totalAmount) => {
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid >= totalAmount) return "paid";
  return "partially_paid";
};

export const validateExpensePayload = async (body = {}, { partial = false, existing = null } = {}) => {
  const result = {};
  for (const [field, maximum] of [["title", 160], ["description", 600], ["vendor", 160], ["referenceNumber", 100], ["branch", 120], ["notes", 1000], ["receiptUrl", 500]]) {
    if (!partial || field in body) {
      const value = cleanText(body[field], maximum);
      if (field === "title" && !value) throw new ValidationError("Expense title is required", { title: "Required" });
      result[field] = value;
    }
  }
  if (!partial || "category" in body) {
    const category = await ensureExpenseCategory(body.category, { allowInactive: existing && String(existing.category) === String(body.category) });
    result.category = category._id;
  }
  if (!partial || "totalAmount" in body) result.totalAmount = money(body.totalAmount, "Total amount", { minimum: 0.01 });
  if (!partial || "vatAmount" in body) result.vatAmount = money(body.vatAmount ?? 0, "VAT amount");
  if (!partial || "expenseDate" in body) result.expenseDate = parseRiyadhDate(body.expenseDate, "Expense date");
  if ("dueDate" in body) result.dueDate = body.dueDate ? parseRiyadhDate(body.dueDate, "Due date") : null;
  if (!partial || "amountPaid" in body) result.amountPaid = money(body.amountPaid ?? 0, "Amount paid");
  if ("paymentDate" in body) result.paymentDate = body.paymentDate ? parseRiyadhDate(body.paymentDate, "Payment date") : null;
  if ("paymentMethod" in body) {
    if (!EXPENSE_PAYMENT_METHODS.includes(body.paymentMethod)) throw new ValidationError("Invalid payment method");
    result.paymentMethod = body.paymentMethod;
  }
  if ("recordStatus" in body) throw new ValidationError("Use the dedicated archive or cancel workflow to change record status");

  const totalAmount = result.totalAmount ?? Number(existing?.totalAmount);
  const vatAmount = result.vatAmount ?? Number(existing?.vatAmount || 0);
  const amountPaid = result.amountPaid ?? Number(existing?.amountPaid || 0);
  const paymentDate = "paymentDate" in result ? result.paymentDate : existing?.paymentDate || null;
  const paymentMethod = result.paymentMethod ?? existing?.paymentMethod ?? "unrecorded";
  if (vatAmount > totalAmount) throw new ValidationError("VAT amount cannot exceed the total amount");
  if (amountPaid > totalAmount) throw new ValidationError("Amount paid cannot exceed the total amount");
  const paymentStatus = derivePaymentStatus(amountPaid, totalAmount);
  if (body.paymentStatus && (!EXPENSE_PAYMENT_STATUSES.includes(body.paymentStatus) || body.paymentStatus !== paymentStatus)) {
    throw new ValidationError(`Payment status must be ${paymentStatus.replaceAll("_", " ")} for the recorded amount paid`);
  }
  if (amountPaid > 0 && (!paymentDate || paymentMethod === "unrecorded")) {
    throw new ValidationError("Payment date and payment method are required when an amount is paid");
  }
  if (amountPaid === 0) {
    result.paymentDate = null;
    result.paymentMethod = "unrecorded";
  }
  result.paymentStatus = paymentStatus;
  return result;
};

export const validateRecurringPayload = async (body = {}, { partial = false, existing = null } = {}) => {
  const result = {};
  for (const [field, maximum] of [["title", 160], ["description", 600], ["vendor", 160], ["referencePrefix", 60], ["branch", 120], ["notes", 1000], ["receiptUrl", 500]]) {
    if (!partial || field in body) {
      const value = cleanText(body[field], maximum);
      if (field === "title" && !value) throw new ValidationError("Recurring expense title is required");
      result[field] = value;
    }
  }
  if (!partial || "category" in body) {
    const category = await ensureExpenseCategory(body.category, { allowInactive: existing && String(existing.category) === String(body.category) });
    result.category = category._id;
  }
  if (!partial || "defaultAmount" in body) result.defaultAmount = money(body.defaultAmount, "Default amount", { minimum: 0.01 });
  if (!partial || "vatAmount" in body) result.vatAmount = money(body.vatAmount ?? 0, "VAT amount");
  if (!partial || "frequency" in body) {
    if (!EXPENSE_FREQUENCIES.includes(body.frequency)) throw new ValidationError("Invalid recurring frequency");
    result.frequency = body.frequency;
  }
  if (!partial || "startDate" in body) result.startDate = parseRiyadhDate(body.startDate, "Start date");
  if ("endDate" in body) result.endDate = body.endDate ? parseRiyadhDate(body.endDate, "End date") : null;
  if (!partial || "nextDueDate" in body) result.nextDueDate = parseRiyadhDate(body.nextDueDate || body.startDate, "Next due date");
  if ("isActive" in body) result.isActive = Boolean(body.isActive);

  const amount = result.defaultAmount ?? Number(existing?.defaultAmount);
  const vat = result.vatAmount ?? Number(existing?.vatAmount || 0);
  const startDate = result.startDate ?? existing?.startDate;
  const nextDueDate = result.nextDueDate ?? existing?.nextDueDate;
  const endDate = "endDate" in result ? result.endDate : existing?.endDate || null;
  if (vat > amount) throw new ValidationError("VAT amount cannot exceed the default amount");
  if (nextDueDate < startDate) throw new ValidationError("Next due date cannot be before the start date");
  if (endDate && endDate < startDate) throw new ValidationError("End date cannot be before the start date");
  return result;
};

export const buildExpenseFilter = (query = {}) => {
  const recordStatus = query.recordStatus || "active";
  if (!EXPENSE_RECORD_STATUSES.includes(recordStatus)) throw new ValidationError("Invalid expense record status filter");
  const filter = { source: "operating_expense", recordStatus };
  if (query.category) filter.category = assertObjectId(query.category, "expense category");
  if (query.paymentStatus && query.paymentStatus !== "all") {
    if (!EXPENSE_PAYMENT_STATUSES.includes(query.paymentStatus)) throw new ValidationError("Invalid payment status filter");
    filter.paymentStatus = query.paymentStatus;
  }
  if (query.recurring === "true") filter.recurringTemplate = { $ne: null };
  if (query.recurring === "false") filter.recurringTemplate = null;
  if (query.from || query.to) {
    filter.expenseDate = {};
    if (query.from) filter.expenseDate.$gte = parseRiyadhDate(query.from, "From date");
    if (query.to) filter.expenseDate.$lt = new Date(parseRiyadhDate(query.to, "To date").getTime() + ADMIN_DAY_MS);
    if (filter.expenseDate.$gte && filter.expenseDate.$lt && filter.expenseDate.$gte >= filter.expenseDate.$lt) throw new ValidationError("From date must be before or equal to To date");
  }
  if (query.vendor?.trim()) filter.vendor = new RegExp(escapeRegex(query.vendor.trim()), "i");
  if (query.search?.trim()) {
    const value = new RegExp(escapeRegex(query.search.trim()), "i");
    filter.$or = [{ title: value }, { description: value }, { vendor: value }, { referenceNumber: value }];
  }
  return filter;
};

export const generateDueRecurringExpenses = async ({ throughDate = toRiyadhDateKey(new Date()), actor }) => {
  const through = parseRiyadhDate(throughDate, "Generate through date");
  const templates = await RecurringExpense.find({
    isActive: true,
    nextDueDate: { $lte: through },
  });
  const created = [];
  let alreadyExisting = 0;
  for (const template of templates) {
    let due = new Date(template.nextDueDate);
    while (due <= through && (!template.endDate || due <= template.endDate)) {
      const periodKey = toRiyadhDateKey(due);
      let result;
      try {
        result = await Expense.updateOne(
          { recurringTemplate: template._id, recurrencePeriodKey: periodKey },
          {
            $setOnInsert: {
            title: template.title,
            description: template.description,
            category: template.category,
            totalAmount: template.defaultAmount,
            vatAmount: template.vatAmount,
            expenseDate: due,
            dueDate: due,
            paymentStatus: "unpaid",
            amountPaid: 0,
            paymentMethod: "unrecorded",
            vendor: template.vendor,
            referenceNumber: template.referencePrefix ? `${template.referencePrefix}-${periodKey}` : "",
            branch: template.branch,
            notes: template.notes,
            receiptUrl: template.receiptUrl,
            recurringTemplate: template._id,
            recurrencePeriodKey: periodKey,
            source: "operating_expense",
            recordStatus: "active",
            createdBy: actor._id,
            updatedBy: actor._id,
            },
          },
          { upsert: true }
        );
      } catch (error) {
        // A concurrent generator may win after this request's upsert check.
        if (error?.code === 11000) {
          alreadyExisting += 1;
          due = addRecurringPeriod(due, template.frequency);
          continue;
        }
        throw error;
      }
      if (result.upsertedCount) created.push(result.upsertedId);
      else alreadyExisting += 1;
      due = addRecurringPeriod(due, template.frequency);
    }
    await RecurringExpense.updateOne(
      { _id: template._id },
      { $max: { nextDueDate: due }, $set: { updatedBy: actor._id } }
    );
  }
  return { createdCount: created.length, alreadyExisting, createdIds: created, throughDate };
};

export const expenseSummaryAggregation = async (filter) => {
  const [summary = {}] = await Expense.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalExpenses: { $sum: "$totalAmount" },
        paidAmount: { $sum: "$amountPaid" },
        outstandingAmount: { $sum: { $subtract: ["$totalAmount", "$amountPaid"] } },
        count: { $sum: 1 },
        paidCount: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] } },
        unpaidCount: { $sum: { $cond: [{ $ne: ["$paymentStatus", "paid"] }, 1, 0] } },
        recurringTotal: { $sum: { $cond: [{ $ne: ["$recurringTemplate", null] }, "$totalAmount", 0] } },
        recurringCount: { $sum: { $cond: [{ $ne: ["$recurringTemplate", null] }, 1, 0] } },
      },
    },
  ]);
  return {
    totalExpenses: Number(summary.totalExpenses || 0),
    paidAmount: Number(summary.paidAmount || 0),
    outstandingAmount: Number(summary.outstandingAmount || 0),
    count: Number(summary.count || 0),
    paidCount: Number(summary.paidCount || 0),
    unpaidCount: Number(summary.unpaidCount || 0),
    recurringTotal: Number(summary.recurringTotal || 0),
    recurringCount: Number(summary.recurringCount || 0),
  };
};
