import "dotenv/config";
import mongoose from "mongoose";
import { backfillExpenseNumbers } from "../services/expenseNumberBackfillService.js";

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) throw new Error("MONGO_URI is required to backfill expense numbers");

try {
  await mongoose.connect(MONGO_URI);
  const result = await backfillExpenseNumbers();
  console.log(`Expense number backfill complete: ${result.assigned} assigned, ${result.skipped} skipped, ${result.scanned} scanned.`);
} finally {
  await mongoose.disconnect();
}
