import Order from "../models/Order.js";
import StockTransaction from "../models/StockTransaction.js";
import Expense from "../models/Expense.js";
import { buildSalesReport, salesRecognitionStages, salesSourceFilter, SALES_REPORT_DEFINITIONS } from "./salesReportingService.js";
import { resolveAnalyticsRange } from "./adminAnalyticsService.js";
import { expenseFinancialRow } from "./expenseReportingService.js";
import { summarizeHistoricalCosts } from "./profitCostService.js";
import { DELIVERY_PROVIDERS } from "../config/sales.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { ADMIN_DAY_MS, toRiyadhDateKey } from "../utils/adminDate.js";
import { ValidationError } from "../utils/inventoryValidation.js";

const round = n => Number(Number(n).toFixed(2));
const sum = (rows, field) => round(rows.reduce((total, row) => total + Number(row[field] || 0), 0));
const money = (value, count, complete = true) => ({ amount: value, count, complete });
const percentage = (value, sales) => value === null || sales <= 0 ? null : round(value / sales * 100);
export const PROFIT_DEFINITIONS = Object.freeze({
  ...SALES_REPORT_DEFINITIONS,
  foodCost: "Captured order cohort: original recorded STOCK_OUT cost less matched STOCK_IN restoration at the original consumption cost. No current ingredient/recipe prices. Missing and estimated costs never count as verified zero.",
  waste: "Separate completed WASTE/DAMAGED stock movements by occurredAt in the selected Riyadh period; not the same order deduction a second time.",
  expenses: "Expense-date recognized operating expenses, including archived history; cancelled unpaid = zero, legacy cancelled paid = amountPaid. Purchases, supplier invoices and stock-in are not additional operating expenses/COGS.",
  grossProfit: "Net sales minus complete recorded historical food cost; excludes separately reported waste. Null if cost evidence is incomplete/estimated.",
  foodCostPercentage: "Complete recorded food cost / positive net sales × 100; excludes separate waste. Null if incomplete or net sales is not positive.",
  operatingProfit: "Recorded-basis gross profit minus separate recorded waste and recognized operating expenses. Indicative, not confirmed net profit. Not allocated to a selected sales channel.",
  commission: "No structured confirmed commission/settlement ledger exists. Platform pricing variance is context, not a fee. Any fee bill already recorded as an operating expense is included once; no extra inferred fee is deducted.",
  tax: "Recorded-amount basis: expense VAT stays inside its recognized gross total. Sales/stock tax-basis snapshots are unavailable, so no assumed VAT rate or selective net-of-VAT deduction is applied. Not a tax-reconciled/net-profit statement.",
  channel: "Channel comparison allocates only each channel's captured sales and historical order cost. Restaurant-wide waste/expenses are not arbitrarily distributed.",
});

export function composeProfitReport({ sales, orders, movements, waste, expenses, undatedWaste = 0, range, query = {}, now = new Date() }) {
  const captured = orders.filter(row => row.reportCaptured), costs = summarizeHistoricalCosts(captured, movements, waste);
  const expenseRows = expenses.map(expenseFinancialRow), operatingExpenses = sum(expenseRows, "recognizedAmount"), expenseVat = sum(expenseRows, "recognizedVat");
  const platform = captured.filter(row => DELIVERY_PROVIDERS.includes(row.source) || row.deliveryPaymentType === "aggregator_prepaid");
  const comparable = orders.every(row => row.reportNet !== undefined);
  const consistent = captured.length === sales.summary.capturedOrders && (!comparable || [
    ["reportNet", "netSales"], ["reportGross", "grossSales"], ["reportRefund", "completedRefunds"], ["reportVoid", "voidAmount"],
  ].every(([field, metric]) => Math.abs(sum(orders, field) - sales.summary[metric]) < 0.005));
  const recordedFoodComplete = consistent && costs.food.missingOrders === 0 && costs.food.estimatedOrders === 0;
  const calculableEstimate = consistent && costs.food.missingOrders === 0;
  const restaurantScope = !query.source || query.source === "all";
  const grossProfit = recordedFoodComplete ? round(sales.summary.netSales - costs.food.recordedCost) : null;
  const estimatedGrossProfit = grossProfit === null && calculableEstimate ? round(sales.summary.netSales - costs.food.recordedCost - costs.food.estimatedCost) : null;
  const wasteComplete = costs.waste.missingMovements === 0 && undatedWaste === 0;
  const operatingProfit = grossProfit !== null && wasteComplete && costs.waste.estimatedCost === 0 && !platform.length && restaurantScope ? round(grossProfit - costs.waste.recordedCost - operatingExpenses) : null;
  const estimatedOperatingProfit = operatingProfit === null && calculableEstimate && wasteComplete && !platform.length && restaurantScope ? round((grossProfit ?? estimatedGrossProfit) - costs.waste.recordedCost - costs.waste.estimatedCost - operatingExpenses) : null;
  const warnings = [PROFIT_DEFINITIONS.tax];
  if (!consistent) warnings.push("Sales and order evidence changed during this read. Refresh before interpreting profit; no mixed-snapshot profit is asserted.");
  if (costs.food.missingOrders) warnings.push(`${costs.food.missingOrders} captured orders have incomplete historical food cost; missing cost is not zero.`);
  if (costs.food.estimatedOrders) warnings.push(`${costs.food.estimatedOrders} orders use historical unit-cost estimates rather than complete batch evidence.`);
  if (!wasteComplete) warnings.push("Waste costs or occurrence dates are incomplete. Undated movements cannot be assigned to this reporting period.");
  if (platform.length) warnings.push(`${platform.length} platform/prepaid orders have no reconciled commission/settlement evidence. Operating profit is unavailable; pricing differences are not commissions.`);
  if (!restaurantScope) warnings.push("Waste and operating expenses below are restaurant-wide and are not allocated to this selected channel. Channel operating profit is unavailable.");
  return {
    generatedAt: now, currency: "SAR", timezone: "Asia/Riyadh", status: operatingProfit === null ? "incomplete" : "indicative_recorded_basis",
    range: { period: range.period, from: toRiyadhDateKey(range.start), to: toRiyadhDateKey(new Date(range.end.getTime() - ADMIN_DAY_MS)), start: range.start, endExclusive: range.end },
    filters: { source: query.source || "all" }, sales: sales.summary, cashActivity: sales.cashActivity,
    food: { ...costs.food, complete: recordedFoodComplete, totalOrders: captured.length }, waste: { ...costs.waste, undatedMovements: undatedWaste, scope: "restaurant-wide" },
    expenses: { ...money(operatingExpenses, expenses.length), vatIncluded: expenseVat, scope: "restaurant-wide", archivedIncluded: true },
    commissions: { amount: null, status: "not_separately_recorded", unreconciledOrders: platform.length },
    platform: { orderedValue: platform.every(row => row.platformTotal != null) ? sum(platform, "platformTotal") : null, missingOrderValues: platform.filter(row => row.platformTotal == null).length, pricingVariance: sum(platform, "totalDifference"), adjustments: null, settlements: null },
    tax: { reconciled: false, salesVat: null, stockVat: null, expenseVatIncluded: expenseVat, basis: "recorded amounts; VAT basis unverified" },
    metrics: { grossProfit, estimatedGrossProfit, operatingProfit, estimatedOperatingProfit,
      foodCostPercentage: recordedFoodComplete ? percentage(costs.food.recordedCost, sales.summary.netSales) : null,
      grossMargin: percentage(grossProfit, sales.summary.netSales), operatingMargin: percentage(operatingProfit, sales.summary.netSales), netProfit: null,
      salesLessKnownCosts: round(sales.summary.netSales - costs.food.recordedCost - costs.food.partialKnownCost - costs.waste.recordedCost - operatingExpenses),
    },
    channels: sales.sourceBreakdown.map(channel => {
      const lines = costs.orderCosts.filter(row => row.source === channel.source), knownCost = sum(lines.filter(row => row.quality === "recorded"), "amount"), missing = lines.filter(row => row.quality !== "recorded").length;
      const gross = !missing && consistent ? round(channel.netSales - knownCost) : null;
      return { ...channel, recordedFoodCost: knownCost, missingOrEstimatedOrders: missing, grossProfit: gross, grossMargin: percentage(gross, channel.netSales), operatingProfit: null };
    }),
    gaps: costs.orderCosts.filter(row => row.quality !== "recorded").slice(0, 20), gapCount: costs.food.missingOrders + costs.food.estimatedOrders,
    nonCapturedOrders: orders.length - captured.length,
    definitions: PROFIT_DEFINITIONS, warnings,
  };
}

export async function buildProfitReport({ role, query = {}, now = new Date() }) {
  if (!hasCapability(role, CAPABILITIES.FINANCE_READ) || !hasCapability(role, CAPABILITIES.INVENTORY_READ)) throw Object.assign(new ValidationError("Profit reporting access denied"), { status: 403 });
  if (Object.keys(query).some(key => !["period", "from", "to", "source"].includes(key))) throw new ValidationError("Unsupported profit report filter");
  const range = resolveAnalyticsRange({ ...query, period: query.period || "month" }, now);
  const cohort = { $and: [salesSourceFilter(query), { $expr: { $and: [{ $gte: [{ $ifNull: ["$orderOccurredAt", "$createdAt"] }, range.start] }, { $lt: [{ $ifNull: ["$orderOccurredAt", "$createdAt"] }, range.end] }] } }] };
  const [sales, orders, waste, expenses, undatedWaste] = await Promise.all([
    buildSalesReport({ query, range }),
    Order.aggregate([{ $match: cohort }, ...salesRecognitionStages(range), { $project: { orderNumber: 1, source: 1, deliveryPaymentType: 1, platformTotal: 1, totalDifference: 1, reportCaptured: 1, reportNet: 1, reportGross: 1, reportRefund: 1, reportVoid: 1, items: 1, inventoryStatus: 1, inventoryTransactions: 1, inventoryRestorationTransactions: 1, inventoryReturnedQuantities: 1 } }, { $limit: 10_001 }]),
    StockTransaction.find({ status: "COMPLETED", movementType: { $in: ["WASTE", "DAMAGED"] }, occurredAt: { $gte: range.start, $lt: range.end } }).select("movementType status quantity unitCost batchAllocations reference transactionNumber").limit(100_001).lean(),
    Expense.find({ source: { $in: ["operating_expense", null] }, expenseDate: { $gte: range.start, $lt: range.end } }).select("totalAmount amountPaid vatAmount recordStatus").limit(20_001).lean(),
    StockTransaction.countDocuments({ status: "COMPLETED", movementType: { $in: ["WASTE", "DAMAGED"] }, occurredAt: null }),
  ]);
  if (orders.length > 10_000 || waste.length > 100_000 || expenses.length > 20_000) throw new ValidationError("Report is too large. Choose a shorter period; totals were not truncated");
  const capturedIds = orders.filter(row => row.reportCaptured).map(row => row._id);
  const movements = capturedIds.length ? await StockTransaction.find({ order: { $in: capturedIds }, status: "COMPLETED", movementType: { $in: ["STOCK_OUT", "STOCK_IN"] } }).select("order item status movementType quantity unitCost batchAllocations sourceDetails createdAt occurredAt").limit(200_001).lean() : [];
  if (movements.length > 200_000) throw new ValidationError("Consumption evidence is too large. Choose a shorter period; totals were not truncated");
  return composeProfitReport({ sales, orders, movements, waste, expenses, undatedWaste, range, query, now });
}
