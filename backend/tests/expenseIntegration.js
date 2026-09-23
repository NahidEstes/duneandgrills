import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Expense from "../models/Expense.js";
import ExpenseCategory from "../models/ExpenseCategory.js";
import RecurringExpense from "../models/RecurringExpense.js";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import { archiveExpense, updateExpense } from "../controllers/expenseController.js";
import { authorize, protect } from "../middleware/auth.js";
import { buildExpenseFilter, expenseSummaryAggregation, generateDueRecurringExpenses, validateExpensePayload } from "../services/expenseService.js";

const testUri = process.env.MONGO_TEST_URI || "mongodb://127.0.0.1:27017/duneandgrills_expense_test";

const run = async () => {
  await mongoose.connect(testUri);
  const databaseName = mongoose.connection.db.databaseName;
  if (!databaseName.endsWith("_test")) throw new Error(`Refusing to run destructive checks against ${databaseName}`);
  await mongoose.connection.dropDatabase();
  await Promise.all([Expense.syncIndexes(), ExpenseCategory.syncIndexes(), RecurringExpense.syncIndexes()]);
  const admin = await User.create({ name: "Finance Test Admin", email: "finance-admin@example.com", password: "TestPassword123!", role: "admin" });
  const category = await ExpenseCategory.create({ name: "Rent", createdBy: admin._id, updatedBy: admin._id });

  const unpaid = await validateExpensePayload({ title: "September rent", category: category._id, totalAmount: 1000, vatAmount: 150, expenseDate: "2026-09-01", amountPaid: 0 });
  assert.equal(unpaid.paymentStatus, "unpaid");
  const partial = await validateExpensePayload({ title: "Electricity", category: category._id, totalAmount: 500, vatAmount: 0, expenseDate: "2026-09-02", amountPaid: 200, paymentDate: "2026-09-03", paymentMethod: "card" });
  assert.equal(partial.paymentStatus, "partially_paid");
  await assert.rejects(validateExpensePayload({ title: "Invalid", category: category._id, totalAmount: 100, expenseDate: "2026-09-01", amountPaid: 101, paymentDate: "2026-09-01", paymentMethod: "cash" }), /cannot exceed/);
  await assert.rejects(validateExpensePayload({ title: "Invalid", category: category._id, totalAmount: 100, expenseDate: "2026-09-01", amountPaid: 20 }), /Payment date and payment method/);

  await Expense.create({ ...unpaid, createdBy: admin._id, updatedBy: admin._id });
  await Expense.create({ ...partial, createdBy: admin._id, updatedBy: admin._id });
  const summary = await expenseSummaryAggregation(buildExpenseFilter({ from: "2026-09-01", to: "2026-09-30" }));
  assert.equal(summary.totalExpenses, 1500);
  assert.equal(summary.paidAmount, 200);
  assert.equal(summary.outstandingAmount, 1300);
  assert.equal(await Expense.countDocuments({ source: "inventory_purchase" }), 0, "inventory purchases must not be silently copied into expenses");

  const recurring = await RecurringExpense.create({ title: "Monthly rent", category: category._id, defaultAmount: 1000, frequency: "monthly", startDate: new Date("2026-09-01T00:00:00Z"), nextDueDate: new Date("2026-09-01T00:00:00Z"), createdBy: admin._id, updatedBy: admin._id });
  const results = await Promise.all(Array.from({ length: 5 }, () => generateDueRecurringExpenses({ throughDate: "2026-09-30", actor: admin })));
  assert.equal(await Expense.countDocuments({ recurringTemplate: recurring._id, recurrencePeriodKey: "2026-09-01" }), 1, "concurrent generation must remain idempotent");
  assert.equal(results.reduce((total, row) => total + row.createdCount, 0), 1);

  const editable = await Expense.findOne({ title: "September rent" });
  let responsePayload;
  const response = { json(value) { responsePayload = value; return value; } };
  await updateExpense({ params: { id: editable._id }, body: { amountPaid: 1000, paymentDate: "2026-09-05", paymentMethod: "bank-transfer" }, user: admin }, response, (error) => { throw error; });
  assert.equal(responsePayload.data.paymentStatus, "paid");
  await archiveExpense({ params: { id: editable._id }, body: { reason: "Test archive" }, user: admin }, response, (error) => { throw error; });
  assert.equal((await Expense.findById(editable._id)).recordStatus, "archived");
  assert.ok(await AuditLog.exists({ entityType: "Expense", entityId: editable._id, action: "EXPENSE_PAYMENT_UPDATED" }));
  assert.ok(await AuditLog.exists({ entityType: "Expense", entityId: editable._id, action: "EXPENSE_ARCHIVED" }));

  await ExpenseCategory.updateOne({ _id: category._id }, { isActive: false });
  assert.equal(await Expense.countDocuments({ category: category._id }), 3, "archiving a category must preserve historical expenses");
  const denied = { statusCode: 0 };
  authorize("admin")({ user: { role: "manager" } }, { status(code) { denied.statusCode = code; return this; }, json() { return this; } }, () => {});
  assert.equal(denied.statusCode, 403);
  const unauthenticated = { statusCode: 0 };
  await protect({ headers: {} }, { status(code) { unauthenticated.statusCode = code; return this; }, json() { return this; } }, () => {});
  assert.equal(unauthenticated.statusCode, 401);
  console.log("Expense integration checks passed");
};

try { await run(); } finally { if (mongoose.connection.readyState === 1) { if (mongoose.connection.db.databaseName.endsWith("_test")) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); } }
