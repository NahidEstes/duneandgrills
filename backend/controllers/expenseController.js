import Expense from "../models/Expense.js";
import { expenseFinancialRow, expenseFinancialStages, EXPENSE_REPORT_BOUNDARY } from "../services/expenseReportingService.js";
import { runInventoryTransaction } from "../services/inventoryStockService.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import ExpenseCategory from "../models/ExpenseCategory.js";
import RecurringExpense from "../models/RecurringExpense.js";
import { pickAuditFields, recordAuditLog } from "../services/auditLogService.js";
import {
  buildExpenseFilter,
  createExpenseRecord,
  expenseSummaryAggregation,
  generateDueRecurringExpenses,
  toRiyadhDateKey,
  validateExpensePayload,
  validateRecurringPayload,
} from "../services/expenseService.js";
import { ADMIN_DAY_MS, parseRiyadhDate, startOfRiyadhMonth } from "../utils/adminDate.js";
import { assertObjectId, escapeRegex, parsePagination, ValidationError } from "../utils/inventoryValidation.js";

const EXPENSE_AUDIT_FIELDS = ["expenseNumber", "title", "category", "totalAmount", "vatAmount", "expenseDate", "dueDate", "paymentStatus", "amountPaid", "paymentDate", "paymentMethod", "vendor", "referenceNumber", "branch", "notes", "receiptUrl", "recordStatus", "cancelledAt", "cancelledBy", "cancellationReason"];
const RECURRING_AUDIT_FIELDS = ["title", "category", "defaultAmount", "vatAmount", "frequency", "startDate", "endDate", "nextDueDate", "vendor", "isActive"];
const CATEGORY_AUDIT_FIELDS = ["name", "description", "color", "isActive"];
const expensePopulate = [
  { path: "category", select: "name color isActive" },
  { path: "createdBy", select: "name role" },
  { path: "updatedBy", select: "name role" },
  { path: "recurringTemplate", select: "title frequency isActive" },
];

const cleanText = (value, maximum = 300) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const expenseAuditLabel = (expense) => [expense.expenseNumber, expense.title].filter(Boolean).join(" · ");

const parseRange = (query = {}) => {
  if (query.from || query.to) {
    const from = parseRiyadhDate(query.from || query.to, "From date");
    const toStart = parseRiyadhDate(query.to || query.from, "To date");
    if (from > toStart) throw new ValidationError("From date must be before or equal to To date");
    return { from, to: new Date(toStart.getTime() + ADMIN_DAY_MS), fromKey: query.from || query.to, toKey: query.to || query.from };
  }
  const shifted = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const fromKey = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1));
  const toKey = new Date(nextMonth.getTime() - ADMIN_DAY_MS).toISOString().slice(0, 10);
  return { from: parseRiyadhDate(fromKey), to: parseRiyadhDate(toKey).getTime() + ADMIN_DAY_MS, fromKey, toKey };
};

export const listExpenseCategories = async (req, res, next) => {
  try {
    const match = req.query.includeInactive === "true" ? {} : { isActive: true };
    const rows = await ExpenseCategory.aggregate([
      { $match: match },
      { $lookup: { from: Expense.collection.name, let: { categoryId: "$_id" }, pipeline: [{ $match: { source: "operating_expense", $expr: { $eq: ["$category", "$$categoryId"] } } }, ...expenseFinancialStages()], as: "expenses" } },
      { $addFields: { expenseCount: { $size: "$expenses" }, totalRecorded: { $sum: "$expenses.recognizedAmount" } } },
      { $project: { expenses: 0 } },
      { $sort: { name: 1 } },
    ]);
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

export const createExpenseCategory = async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 80);
    if (!name) throw new ValidationError("Category name is required");
    const category = await ExpenseCategory.create({
      name,
      description: cleanText(req.body.description),
      color: cleanText(req.body.color, 20) || "#f59e0b",
      isActive: req.body.isActive !== false,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
    await recordAuditLog({ actor: req.user, action: "EXPENSE_CATEGORY_CREATED", entityType: "ExpenseCategory", entityId: category._id, entityLabel: category.name, after: pickAuditFields(category, CATEGORY_AUDIT_FIELDS) });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "This expense category already exists" });
    next(error);
  }
};

export const updateExpenseCategory = async (req, res, next) => {
  try {
    const category = await ExpenseCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: "Expense category not found" });
    const before = pickAuditFields(category, CATEGORY_AUDIT_FIELDS);
    if ("name" in req.body) {
      const name = cleanText(req.body.name, 80);
      if (!name) throw new ValidationError("Category name is required");
      category.name = name;
    }
    if ("description" in req.body) category.description = cleanText(req.body.description);
    if ("color" in req.body) category.color = cleanText(req.body.color, 20) || "#f59e0b";
    if ("isActive" in req.body) category.isActive = Boolean(req.body.isActive);
    category.updatedBy = req.user._id;
    await category.save();
    await recordAuditLog({ actor: req.user, action: "EXPENSE_CATEGORY_UPDATED", entityType: "ExpenseCategory", entityId: category._id, entityLabel: category.name, before, after: pickAuditFields(category, CATEGORY_AUDIT_FIELDS) });
    res.json({ success: true, data: category });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "This expense category already exists" });
    next(error);
  }
};

export const archiveExpenseCategory = async (req, res, next) => {
  try {
    const category = await ExpenseCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: "Expense category not found" });
    if (!category.isActive) return res.json({ success: true, message: "Expense category is already archived" });
    const before = pickAuditFields(category, CATEGORY_AUDIT_FIELDS);
    category.isActive = false;
    category.updatedBy = req.user._id;
    await category.save();
    await recordAuditLog({ actor: req.user, action: "EXPENSE_CATEGORY_ARCHIVED", entityType: "ExpenseCategory", entityId: category._id, entityLabel: category.name, before, after: pickAuditFields(category, CATEGORY_AUDIT_FIELDS) });
    res.json({ success: true, message: "Expense category archived. Historical expenses were preserved." });
  } catch (error) { next(error); }
};

export const listExpenses = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 20);
    const filter = buildExpenseFilter(req.query);
    const [rows, total, summary] = await Promise.all([
      Expense.find(filter).populate(expensePopulate).sort({ expenseDate: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Expense.countDocuments(filter),
      expenseSummaryAggregation(filter),
    ]);
    res.json({ success: true, data: rows.map(expenseFinancialRow), summary, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

export const exportExpenses = async (req, res, next) => {
  try {
    const rows = await Expense.find(buildExpenseFilter(req.query, { financial: true }))
      .populate("category", "name")
      .sort({ expenseDate: -1, createdAt: -1 })
      .limit(5000)
      .lean();
    res.json({ success: true, data: rows.map(expenseFinancialRow), truncated: rows.length === 5000, accountingBoundary: EXPENSE_REPORT_BOUNDARY });
  } catch (error) { next(error); }
};

export const getExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id).populate(expensePopulate).lean();
    if (!expense) return res.status(404).json({ success: false, message: "Expense not found" });
    res.json({ success: true, data: expense });
  } catch (error) { next(error); }
};

export const createExpense = async (req, res, next) => {
  try {
    const payload = await validateExpensePayload(req.body);
    const expense = await createExpenseRecord({ ...payload, createdBy: req.user._id, updatedBy: req.user._id });
    await recordAuditLog({ actor: req.user, action: "EXPENSE_CREATED", entityType: "Expense", entityId: expense._id, entityLabel: expenseAuditLabel(expense), after: pickAuditFields(expense, EXPENSE_AUDIT_FIELDS) });
    await expense.populate(expensePopulate);
    res.status(201).json({ success: true, data: expense });
  } catch (error) { next(error); }
};

export const updateExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: "Expense not found" });
    if (expense.recordStatus !== "active") throw new ValidationError("Archived or cancelled expenses cannot be edited");
    const before = pickAuditFields(expense, EXPENSE_AUDIT_FIELDS);
    const payload = await validateExpensePayload(req.body, { partial: true, existing: expense });
    expense.set({ ...payload, updatedBy: req.user._id });
    await expense.save();
    const paymentChanged = before.paymentStatus !== expense.paymentStatus || Number(before.amountPaid) !== Number(expense.amountPaid);
    await recordAuditLog({ actor: req.user, action: paymentChanged ? "EXPENSE_PAYMENT_UPDATED" : "EXPENSE_UPDATED", entityType: "Expense", entityId: expense._id, entityLabel: expenseAuditLabel(expense), before, after: pickAuditFields(expense, EXPENSE_AUDIT_FIELDS) });
    await expense.populate(expensePopulate);
    res.json({ success: true, data: expense });
  } catch (error) { next(error); }
};

const changeExpenseRecordState = async (req, res, next, cancel) => {
  try {
    if (!hasCapability(req.user?.role, CAPABILITIES.FINANCE_WRITE)) throw Object.assign(new ValidationError("Not authorized for this action"), { status: 403 });
    if (!cancel && req.body.recordStatus && req.body.recordStatus !== "archived") throw new ValidationError("Use the dedicated cancellation action; archive does not cancel an expense");
    const reason = cleanText(req.body.reason, 500);
    if (cancel && reason.length < 3) throw new ValidationError("A cancellation reason of at least 3 characters is required");
    await runInventoryTransaction(async (session) => {
      if (!session) throw Object.assign(new Error("Expense state changes require MongoDB transaction support"), { status: 503 });
      const expense = await Expense.findById(req.params.id).session(session);
      if (!expense) throw Object.assign(new ValidationError("Expense not found"), { status: 404 });
      const target = cancel ? "cancelled" : "archived";
      if (expense.recordStatus === target) return;
      if (!cancel && expense.recordStatus === "cancelled") throw new ValidationError("Cancelled expenses cannot be reclassified as archived");
      if (cancel && Number(expense.amountPaid) > 0) throw new ValidationError("Paid or partially paid expenses cannot be cancelled. Record an authorized payment reversal first; archiving safely preserves their financial effect");
      const before = pickAuditFields(expense, EXPENSE_AUDIT_FIELDS);
      expense.recordStatus = target;
      expense.updatedBy = req.user._id;
      if (cancel) {
        expense.cancelledAt = new Date();
        expense.cancelledBy = req.user._id;
        expense.cancellationReason = reason;
      }
      await expense.save({ session });
      await recordAuditLog({ actor: req.user, action: cancel ? "EXPENSE_CANCELLED" : "EXPENSE_ARCHIVED", entityType: "Expense", entityId: expense._id, entityLabel: expenseAuditLabel(expense), before, after: pickAuditFields(expense, EXPENSE_AUDIT_FIELDS), reason, correlationId: req.correlationId }, { session });
    });
    res.json({ success: true, message: cancel ? "Unpaid expense cancelled; original amounts and history preserved." : "Expense archived; historical financial totals are unchanged." });
  } catch (error) { next(error); }
};

export const archiveExpense = (req, res, next) => changeExpenseRecordState(req, res, next, false);
export const cancelExpense = (req, res, next) => changeExpenseRecordState(req, res, next, true);

export const listRecurringExpenses = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status === "active") filter.isActive = true;
    if (req.query.status === "inactive") filter.isActive = false;
    if (req.query.category) filter.category = assertObjectId(req.query.category, "expense category");
    if (req.query.search?.trim()) filter.$or = [{ title: new RegExp(escapeRegex(req.query.search.trim()), "i") }, { vendor: new RegExp(escapeRegex(req.query.search.trim()), "i") }];
    const rows = await RecurringExpense.find(filter).populate("category", "name color isActive").populate("updatedBy", "name role").sort({ nextDueDate: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

export const createRecurringExpense = async (req, res, next) => {
  try {
    const payload = await validateRecurringPayload(req.body);
    const row = await RecurringExpense.create({ ...payload, createdBy: req.user._id, updatedBy: req.user._id });
    await recordAuditLog({ actor: req.user, action: "RECURRING_EXPENSE_CREATED", entityType: "RecurringExpense", entityId: row._id, entityLabel: row.title, after: pickAuditFields(row, RECURRING_AUDIT_FIELDS) });
    await row.populate("category", "name color isActive");
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const updateRecurringExpense = async (req, res, next) => {
  try {
    const row = await RecurringExpense.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Recurring expense not found" });
    const before = pickAuditFields(row, RECURRING_AUDIT_FIELDS);
    row.set({ ...(await validateRecurringPayload(req.body, { partial: true, existing: row })), updatedBy: req.user._id });
    await row.save();
    await recordAuditLog({ actor: req.user, action: "RECURRING_EXPENSE_UPDATED", entityType: "RecurringExpense", entityId: row._id, entityLabel: row.title, before, after: pickAuditFields(row, RECURRING_AUDIT_FIELDS) });
    await row.populate("category", "name color isActive");
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const archiveRecurringExpense = async (req, res, next) => {
  try {
    const row = await RecurringExpense.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Recurring expense not found" });
    const before = pickAuditFields(row, RECURRING_AUDIT_FIELDS);
    row.isActive = false;
    row.updatedBy = req.user._id;
    await row.save();
    await recordAuditLog({ actor: req.user, action: "RECURRING_EXPENSE_ARCHIVED", entityType: "RecurringExpense", entityId: row._id, entityLabel: row.title, before, after: pickAuditFields(row, RECURRING_AUDIT_FIELDS) });
    res.json({ success: true, message: "Recurring expense archived. Generated bills were preserved." });
  } catch (error) { next(error); }
};

export const generateRecurringExpenses = async (req, res, next) => {
  try {
    const result = await generateDueRecurringExpenses({ throughDate: req.body.throughDate || toRiyadhDateKey(new Date()), actor: req.user });
    const createdExpenses = result.createdIds.length
      ? await Expense.find({ _id: { $in: result.createdIds } })
      : [];
    for (const expense of createdExpenses) {
      await recordAuditLog({
        actor: req.user,
        action: "EXPENSE_CREATED",
        entityType: "Expense",
        entityId: expense._id,
        entityLabel: expenseAuditLabel(expense),
        after: pickAuditFields(expense, EXPENSE_AUDIT_FIELDS),
        related: { recurringTemplate: expense.recurringTemplate },
      });
    }
    await recordAuditLog({ actor: req.user, action: "RECURRING_EXPENSES_GENERATED", entityType: "RecurringExpense", entityLabel: "Due recurring expenses", metadata: result });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

const categoryBreakdown = (filter) => Expense.aggregate([
  { $match: filter },
  ...expenseFinancialStages(),
  { $group: { _id: "$category", total: { $sum: "$recognizedAmount" }, count: { $sum: 1 } } },
  { $lookup: { from: ExpenseCategory.collection.name, localField: "_id", foreignField: "_id", as: "category" } },
  { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
  { $project: { _id: 1, total: 1, count: 1, name: { $ifNull: ["$category.name", "Archived category"] }, color: { $ifNull: ["$category.color", "#737373"] } } },
  { $sort: { total: -1 } },
]);

const trendBreakdown = (filter) => Expense.aggregate([
  { $match: filter },
  ...expenseFinancialStages(),
  { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$expenseDate", timezone: "Asia/Riyadh" } }, total: { $sum: "$recognizedAmount" }, paid: { $sum: "$amountPaid" }, count: { $sum: 1 } } },
  { $sort: { _id: 1 } },
  { $project: { _id: 0, month: "$_id", total: 1, paid: 1, count: 1 } },
]);

export const getExpenseDashboard = async (req, res, next) => {
  try {
    const range = parseRange(req.query);
    const filter = { ...buildExpenseFilter(req.query, { financial: true }), expenseDate: { $gte: range.from, $lt: new Date(range.to) } };
    const trendFrom = startOfRiyadhMonth(range.from, -5);
    const trendFilter = { ...filter, expenseDate: { $gte: trendFrom, $lt: new Date(range.to) } };
    const duration = new Date(range.to).getTime() - range.from.getTime();
    const previousFilter = { ...filter, expenseDate: { $gte: new Date(range.from.getTime() - duration), $lt: range.from } };
    const upcomingLimit = new Date(Date.now() + 45 * ADMIN_DAY_MS);
    const [summary, previousSummary, categories, trend, recent, upcoming, activeRecurring] = await Promise.all([
      expenseSummaryAggregation(filter),
      expenseSummaryAggregation(previousFilter),
      categoryBreakdown(filter),
      trendBreakdown(trendFilter),
      Expense.find({ source: "operating_expense", recordStatus: "active" }).populate("category", "name color").sort({ expenseDate: -1, createdAt: -1 }).limit(6).lean(),
      RecurringExpense.find({ isActive: true, nextDueDate: { $lte: upcomingLimit } }).populate("category", "name color").sort({ nextDueDate: 1 }).limit(6).lean(),
      RecurringExpense.aggregate([{ $match: { isActive: true } }, { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$defaultAmount" } } }]),
    ]);
    const previousTotal = previousSummary.totalExpenses;
    const changePercent = previousTotal ? Number((((summary.totalExpenses - previousTotal) / previousTotal) * 100).toFixed(1)) : null;
    res.json({
      success: true,
      data: {
        range: { from: range.fromKey, to: range.toKey },
        summary: { ...summary, previousMonthExpenses: previousTotal, changePercent, activeRecurringCount: activeRecurring[0]?.count || 0, activeRecurringAmount: activeRecurring[0]?.total || 0 },
        categoryBreakdown: categories,
        trend,
        recentExpenses: recent,
        upcomingRecurring: upcoming,
        accountingBoundary: EXPENSE_REPORT_BOUNDARY,
      },
    });
  } catch (error) { next(error); }
};

export const getExpenseReports = async (req, res, next) => {
  try {
    const filter = buildExpenseFilter(req.query, { financial: true });
    const [summary, categories, trend, paymentStatus, recurring] = await Promise.all([
      expenseSummaryAggregation(filter),
      categoryBreakdown(filter),
      trendBreakdown(filter),
      Expense.aggregate([{ $match: filter }, ...expenseFinancialStages(), { $group: { _id: "$paymentStatus", total: { $sum: "$recognizedAmount" }, paid: { $sum: "$amountPaid" }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Expense.aggregate([{ $match: filter }, ...expenseFinancialStages(), { $group: { _id: { $cond: [{ $ne: ["$recurringTemplate", null] }, "recurring", "one_time"] }, total: { $sum: "$recognizedAmount" }, count: { $sum: 1 } } }]),
    ]);
    res.json({ success: true, data: { summary, categoryBreakdown: categories, trend, paymentStatus, recurring, accountingBoundary: EXPENSE_REPORT_BOUNDARY } });
  } catch (error) { next(error); }
};
