import Counter from "../models/Counter.js";
import Expense from "../models/Expense.js";

export const EXPENSE_NUMBER_PATTERN = /^EXP-(\d{4})-(\d{6})$/;
const MAX_SEQUENCE = 999999;

export const getRiyadhCreationYear = (date = new Date()) => Number(new Intl.DateTimeFormat("en", {
  timeZone: "Asia/Riyadh",
  year: "numeric",
}).format(new Date(date)));

export const formatExpenseNumber = (year, sequence) => {
  const normalizedYear = Number(year);
  const normalizedSequence = Number(sequence);
  if (!Number.isInteger(normalizedYear) || normalizedYear < 2000 || normalizedYear > 9999) throw new Error("Expense number year is invalid");
  if (!Number.isInteger(normalizedSequence) || normalizedSequence < 1 || normalizedSequence > MAX_SEQUENCE) throw new Error("Annual expense number capacity was reached");
  return `EXP-${normalizedYear}-${String(normalizedSequence).padStart(6, "0")}`;
};

const counterKey = (year) => `expense-number:${year}`;

export const highestExistingExpenseSequence = async (year) => {
  const latest = await Expense.findOne({ expenseNumber: new RegExp(`^EXP-${year}-\\d{6}$`) })
    .sort({ expenseNumber: -1 })
    .select("expenseNumber")
    .lean();
  return latest ? Number(latest.expenseNumber.slice(-6)) || 0 : 0;
};

export const reserveExpenseNumberWithStore = async ({
  date = new Date(),
  attempts = 4,
  findHighest = highestExistingExpenseSequence,
  increment = async ({ year, floor }) => {
    const counter = await Counter.findOneAndUpdate(
      { _id: counterKey(year) },
      [{ $set: { seq: { $add: [{ $max: [{ $ifNull: ["$seq", 0] }, floor] }, 1] } } }],
      { new: true, upsert: true }
    );
    return counter.seq;
  },
} = {}) => {
  const year = getRiyadhCreationYear(date);
  const floor = await findHighest(year);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const sequence = await increment({ year, floor, counterId: counterKey(year) });
      return { expenseNumber: formatExpenseNumber(year, sequence), year, sequence };
    } catch (error) {
      if (error?.code !== 11000 || attempt === attempts - 1) throw error;
    }
  }
  throw Object.assign(new Error("Could not reserve an expense ID"), { status: 503 });
};

export const reserveNextExpenseNumber = (options = {}) => reserveExpenseNumberWithStore(options);

export const isExpenseNumberDuplicate = (error) => Boolean(
  error?.code === 11000 && (error?.keyPattern?.expenseNumber || error?.keyValue?.expenseNumber)
);
