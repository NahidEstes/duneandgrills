import assert from "node:assert/strict";
import { test } from "node:test";
import { historicalOrderCost, historicalMovementCost, summarizeHistoricalCosts } from "../services/profitCostService.js";
import { composeProfitReport, buildProfitReport } from "../services/profitReportingService.js";
const range = { start: new Date("2026-10-17T21:00:00Z"), end: new Date("2026-10-18T21:00:00Z"), period: "today" };
const order = (key = "order", extra = {}) => ({ _id: key, orderNumber: `TEST-${key}`, source: "pos", reportCaptured: true, inventoryStatus: "deducted", items: [{ menuItem: "menu", quantity: 1 }], ...extra });
const deduction = (key = "order", extra = {}) => ({ _id: `out-${key}`, order: key, item: "ingredient", status: "COMPLETED", movementType: "STOCK_OUT", quantity: 2, unitCost: 10, batchAllocations: [{ batch: `batch-${key}`, lotNumber: `lot-${key}`, quantity: 2, unitCost: 10 }], sourceDetails: { components: [{ type: "menu_recipe", menuItem: "menu", ingredientQuantity: 2 }], lineQuantities: [{ index: 0, quantity: 2 }] }, ...extra });
const sales = (extra = {}) => ({ summary: { netSales: 100, grossSales: 100, discountTotal: 10, orderedAmount: 150, collectedAmount: 100, completedRefunds: 0, voidAmount: 0, capturedOrders: 1, totalOrders: 1, ...extra }, sourceBreakdown: [{ source: "pos", netSales: 100 }], cashActivity: { netCollected: 100 } });
const report = extra => composeProfitReport({ sales: sales(), orders: [order()], movements: [deduction()], waste: [], expenses: [], range, ...extra });

test("historical batch consumption and returns use original lot cost once, never replacement prices", () => {
  const sale = order("order", { inventoryRestorationTransactions: ["return"] });
  const returned = { _id: "return", order: "order", item: "ingredient", status: "COMPLETED", movementType: "STOCK_IN", quantity: 1, unitCost: 999, sourceDetails: { originalDeduction: "out-order" }, batchAllocations: [{ batch: "batch-order", lotNumber: "lot-order", quantity: 1, unitCost: 999 }] };
  const cost = historicalOrderCost(sale, [deduction(), returned, returned]);
  assert.equal(cost.quality, "recorded"); assert.equal(cost.consumedCost, 20); assert.equal(cost.restoredCost, 10); assert.equal(cost.amount, 10);
  assert.equal(report({ orders: [sale], movements: [deduction(), returned] }).metrics.grossProfit, 90);
});

test("a full remaining return reverses remaining lot cost after a differently priced partial return", () => {
  const debit = deduction("order", { batchAllocations: [{ batch: "cheap", quantity: 1, unitCost: 5 }, { batch: "expensive", quantity: 1, unitCost: 15 }] });
  const first = { _id: "return-one", createdAt: "2026-10-18T10:00:00Z", order: "order", item: "ingredient", status: "COMPLETED", movementType: "STOCK_IN", quantity: 1, sourceDetails: { originalDeduction: "out-order" }, batchAllocations: [{ batch: "cheap", quantity: 1 }] };
  const last = { ...first, _id: "return-two", createdAt: "2026-10-18T11:00:00Z", batchAllocations: [] };
  const result = historicalOrderCost(order("order", { inventoryStatus: "restored" }), [debit, last, first]);
  assert.equal(result.quality, "recorded"); assert.equal(result.restoredCost, 20); assert.equal(result.amount, 0);
});
test("missing cost and incomplete recipe/add-on evidence do not become zero food cost or inflated profit", () => {
  for (const extra of [{ movements: [] }, { movements: [deduction("order", { unitCost: 0, batchAllocations: [{ quantity: 2, unitCost: 0 }] })] }, { orders: [order("order", { items: [{ menuItem: "menu", quantity: 1, selectedAddOns: [{ addOn: "untracked" }] }] })] }]) {
    const result = report(extra); assert.equal(result.food.missingOrders, 1); assert.equal(result.metrics.grossProfit, null); assert.equal(result.metrics.operatingProfit, null); assert.equal(result.metrics.foodCostPercentage, null); assert.equal(result.metrics.netProfit, null);
  }
});
test("stored unit-cost fallback is an explicit estimate, never repriced from a current recipe", () => {
  const result = report({ movements: [deduction("order", { batchAllocations: [], unitCost: 7 })] });
  assert.equal(result.food.estimatedOrders, 1); assert.equal(result.food.estimatedCost, 14); assert.equal(result.metrics.grossProfit, null); assert.equal(result.metrics.estimatedGrossProfit, 86);
  assert.equal(historicalMovementCost({ quantity: 2, unitCost: null }).amount, null);
});
test("completed refund changes sales independently of restocking; full restoration reverses the original cost", () => {
  const refundedSales = sales({ netSales: 60, completedRefunds: 40 });
  assert.equal(report({ sales: refundedSales }).metrics.grossProfit, 40, "Cash refund without restock keeps the consumption cost");
  const returned = { _id: "return", order: "order", item: "ingredient", status: "COMPLETED", movementType: "STOCK_IN", quantity: 2, unitCost: 999, batchAllocations: [] };
  const result = report({ sales: refundedSales, orders: [order("order", { inventoryStatus: "restored", inventoryRestorationTransactions: ["return"] })], movements: [deduction(), returned] });
  assert.equal(result.food.recordedCost, 0); assert.equal(result.food.missingOrders, 0); assert.equal(result.metrics.grossProfit, 60);
  assert.equal(report({ orders: [order("order", { inventoryStatus: "restored" })] }).metrics.grossProfit, null);
});
test("over-restoration and mismatched return lots remain reconciliation gaps", () => {
  for (const returned of [{ quantity: 3 }, { quantity: 1, batchAllocations: [{ batch: "wrong-lot", quantity: 1, unitCost: 10 }] }]) {
    const result = historicalOrderCost(order("order", { inventoryRestorationTransactions: ["return"] }), [deduction(), { _id: "return", order: "order", item: "ingredient", movementType: "STOCK_IN", status: "COMPLETED", ...returned }]);
    assert.equal(result.quality, "missing");
  }
});

test("missing linked consumption/restoration and mismatched return counters block profit", () => {
  const returned = { _id: "return", order: "order", item: "ingredient", status: "COMPLETED", movementType: "STOCK_IN", quantity: 1, sourceDetails: { originalDeduction: "out-order" }, batchAllocations: [{ batch: "batch-order", quantity: 1 }] };
  for (const extra of [
    { inventoryTransactions: ["out-order", "lost-deduction"] },
    { inventoryRestorationTransactions: ["return", "lost-return"] },
    { inventoryReturnedQuantities: { "out-order": 2 } },
  ]) {
    const result = report({ orders: [order("order", extra)], movements: [deduction(), returned] });
    assert.equal(result.food.missingOrders, 1); assert.equal(result.metrics.grossProfit, null);
  }
  assert.equal(historicalOrderCost(order("order", { inventoryReturnedQuantities: { "out-order": 1 } }), [deduction(), returned]).quality, "recorded");
});
test("purchases are excluded; waste rows deduplicate; expense recognition retains archive and cancelled-payment history", () => {
  const waste = { ...deduction("waste"), _id: "waste", movementType: "WASTE", quantity: 1, batchAllocations: [{ batch: "waste-batch", quantity: 1, unitCost: 5 }] };
  const result = report({ sales: sales({ netSales: 200 }), waste: [waste, waste, { ...waste, _id: "purchase", movementType: "PURCHASE_RECEIPT", quantity: 100 }], expenses: [
    { totalAmount: 100, amountPaid: 100, recordStatus: "archived", vatAmount: 10 },
    { totalAmount: 100, amountPaid: 0, recordStatus: "cancelled", vatAmount: 10 },
    { totalAmount: 100, amountPaid: 40, recordStatus: "cancelled", vatAmount: 10 },
  ] });
  assert.equal(result.expenses.amount, 140); assert.equal(result.expenses.vatIncluded, 10); assert.equal(result.waste.recordedCost, 5); assert.equal(result.metrics.operatingProfit, 35);
  assert.equal(result.metrics.netProfit, null); assert.equal(result.tax.reconciled, false);
});
test("missing/undated waste blocks operating profit; shared costs are never assigned to one channel", () => {
  assert.equal(report({ undatedWaste: 1 }).metrics.operatingProfit, null);
  assert.equal(report({ waste: [{ _id: "w", movementType: "DAMAGED", status: "COMPLETED", quantity: 2, unitCost: 0 }] }).metrics.operatingProfit, null);
  const result = report({ query: { source: "pos" }, expenses: [{ totalAmount: 30 }] });
  assert.equal(result.metrics.grossProfit, 80); assert.equal(result.metrics.operatingProfit, null); assert.equal(result.channels[0].operatingProfit, null); assert.equal(result.expenses.amount, 30);
});
test("platform pricing variance is not a confirmed commission or settlement adjustment and expense bills count once", () => {
  const result = report({ orders: [order("order", { source: "jahez", platformTotal: 120, totalDifference: 20 })], expenses: [{ totalAmount: 10, amountPaid: 10, recordStatus: "active" }] });
  assert.equal(result.platform.pricingVariance, 20); assert.equal(result.commissions.amount, null); assert.equal(result.platform.adjustments, null); assert.equal(result.metrics.operatingProfit, null);
  assert.equal(result.expenses.amount, 10); assert.equal(result.metrics.salesLessKnownCosts, 70);
});
test("captured cohort changes fail closed and reporting permissions reject access before database reads", async () => {
  assert.equal(report({ sales: sales({ capturedOrders: 2 }) }).metrics.grossProfit, null);
  assert.equal(report({ orders: [order("order", { reportNet: 101, reportGross: 101, reportRefund: 0, reportVoid: 0 })] }).metrics.grossProfit, null, "Changed amounts with the same captured count must not mix snapshots");
  for (const role of ["customer", "cashier", "kitchen", "inventory", "rider"]) await assert.rejects(buildProfitReport({ role }), error => error.status === 403);
  const facts = summarizeHistoricalCosts([order(), order("missing")], [deduction()], []); assert.equal(facts.food.recordedOrders, 1); assert.equal(facts.food.missingOrders, 1);
});
