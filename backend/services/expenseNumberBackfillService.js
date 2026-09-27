import Expense from "../models/Expense.js";
import { reserveNextExpenseNumber } from "./expenseNumberService.js";

const missingNumberFilter = {
  $or: [
    { expenseNumber: { $exists: false } },
    { expenseNumber: null },
    { expenseNumber: "" },
  ],
};

export const backfillExpenseNumbers = async ({
  ExpenseModel = Expense,
  reserve = reserveNextExpenseNumber,
} = {}) => {
  const rows = await ExpenseModel.find(missingNumberFilter)
    .sort({ createdAt: 1, _id: 1 })
    .select("_id createdAt")
    .lean();
  let assigned = 0;
  let skipped = 0;

  for (const row of rows) {
    const createdAt = row.createdAt || row._id?.getTimestamp?.() || new Date();
    const { expenseNumber } = await reserve({ date: createdAt });
    const result = await ExpenseModel.collection.updateOne(
      { _id: row._id, ...missingNumberFilter },
      { $set: { expenseNumber } }
    );
    if (result.modifiedCount === 1) assigned += 1;
    else skipped += 1;
  }

  return { scanned: rows.length, assigned, skipped };
};
