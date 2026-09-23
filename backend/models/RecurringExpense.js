import mongoose from "mongoose";
import { EXPENSE_FREQUENCIES } from "../config/finance.js";

const recurringExpenseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: "", trim: true, maxlength: 600 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "ExpenseCategory", required: true, index: true },
    defaultAmount: { type: Number, required: true, min: 0.01 },
    vatAmount: { type: Number, default: 0, min: 0 },
    frequency: { type: String, required: true, enum: EXPENSE_FREQUENCIES },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    nextDueDate: { type: Date, required: true, index: true },
    vendor: { type: String, default: "", trim: true, maxlength: 160 },
    referencePrefix: { type: String, default: "", trim: true, maxlength: 60 },
    branch: { type: String, default: "", trim: true, maxlength: 120 },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },
    receiptUrl: { type: String, default: "", trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);

recurringExpenseSchema.index({ isActive: 1, nextDueDate: 1 });
recurringExpenseSchema.index({ category: 1, isActive: 1 });

export default mongoose.model("RecurringExpense", recurringExpenseSchema);
