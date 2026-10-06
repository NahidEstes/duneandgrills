// Archive is presentation-only; legacy cancelled paid records retain their paid effect.
export const expenseFinancialStages = () => [{ $set: {
  recognizedAmount: { $cond: [{ $eq: ["$recordStatus", "cancelled"] }, { $ifNull: ["$amountPaid", 0] }, "$totalAmount"] },
  recognizedVat: { $cond: [{ $eq: ["$recordStatus", "cancelled"] }, 0, { $ifNull: ["$vatAmount", 0] }] },
} }, { $set: { outstandingAmount: { $max: [{ $subtract: ["$recognizedAmount", { $ifNull: ["$amountPaid", 0] }] }, 0] } } }];

export const expenseFinancialRow = (row) => ({ ...row,
  recognizedAmount: row.recordStatus === "cancelled" ? Number(row.amountPaid || 0) : Number(row.totalAmount || 0),
  recognizedVat: row.recordStatus === "cancelled" ? 0 : Number(row.vatAmount || 0),
  outstandingAmount: row.recordStatus === "cancelled" ? 0 : Number((Number(row.totalAmount || 0) - Number(row.amountPaid || 0)).toFixed(2)),
});

export const EXPENSE_REPORT_BOUNDARY = "Expense-date operating expenses (Asia/Riyadh), not payment-date cash flow or profit. Archived records remain included. Cancelled unpaid bills contribute zero; legacy cancelled paid amounts remain recognized until a separately authorized recorded reversal. Inventory purchases and COGS are excluded.";
