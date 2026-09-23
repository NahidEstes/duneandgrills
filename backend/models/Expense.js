import mongoose from "mongoose";
import {
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_PAYMENT_STATUSES,
  EXPENSE_RECORD_STATUSES,
} from "../config/finance.js";

const expenseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: "", trim: true, maxlength: 600 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "ExpenseCategory", required: true, index: true },
    totalAmount: { type: Number, required: true, min: 0.01 },
    vatAmount: { type: Number, default: 0, min: 0 },
    expenseDate: { type: Date, required: true, index: true },
    dueDate: { type: Date, default: null, index: true },
    paymentStatus: { type: String, enum: EXPENSE_PAYMENT_STATUSES, default: "unpaid", index: true },
    amountPaid: { type: Number, default: 0, min: 0 },
    paymentDate: { type: Date, default: null },
    paymentMethod: { type: String, enum: EXPENSE_PAYMENT_METHODS, default: "unrecorded" },
    vendor: { type: String, default: "", trim: true, maxlength: 160, index: true },
    referenceNumber: { type: String, default: "", trim: true, maxlength: 100, index: true },
    branch: { type: String, default: "", trim: true, maxlength: 120 },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },
    receiptUrl: { type: String, default: "", trim: true, maxlength: 500 },
    recurringTemplate: { type: mongoose.Schema.Types.ObjectId, ref: "RecurringExpense", default: null, index: true },
    recurrencePeriodKey: { type: String, default: null, trim: true },
    source: { type: String, enum: ["operating_expense"], default: "operating_expense", immutable: true },
    recordStatus: { type: String, enum: EXPENSE_RECORD_STATUSES, default: "active", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);

expenseSchema.index({ expenseDate: -1, recordStatus: 1 });
expenseSchema.index({ category: 1, expenseDate: -1 });
expenseSchema.index({ paymentStatus: 1, dueDate: 1 });
expenseSchema.index({ title: "text", vendor: "text", referenceNumber: "text" });
expenseSchema.index(
  { recurringTemplate: 1, recurrencePeriodKey: 1 },
  { unique: true, partialFilterExpression: { recurringTemplate: { $type: "objectId" }, recurrencePeriodKey: { $type: "string" } } }
);

export default mongoose.model("Expense", expenseSchema);
