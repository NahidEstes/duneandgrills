import InventoryItem from "../models/InventoryItem.js";
import { getInventoryHealth } from "./inventoryHealthService.js";
import InventorySettings from "../models/InventorySettings.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import StockTransaction from "../models/StockTransaction.js";
import { buildInventoryValuation } from "./inventoryValuationService.js";
import { ADMIN_DAY_MS, ADMIN_TIMEZONE, startOfRiyadhDay, toRiyadhDateKey } from "../utils/adminDate.js";

export const getInventorySettings = async () =>
  InventorySettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

export const buildInventoryDashboard = async () => {
  const now = new Date();
  const todayStart = startOfRiyadhDay(now);
  const valueStart = new Date(todayStart.getTime() - 29 * ADMIN_DAY_MS);

  const [summaryRows, recentActivity, poRows, supplierRows, valueMovementRows, valuation, health] =
    await Promise.all([
      InventoryItem.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            totalItems: { $sum: 1 },
            inventoryValue: { $sum: { $multiply: ["$currentStock", "$unitCost"] } },
            lowStock: { $sum: { $cond: [{ $and: [{ $gt: ["$currentStock", 0] }, { $lte: ["$currentStock", "$reorderLevel"] }] }, 1, 0] } },
            outOfStock: { $sum: { $cond: [{ $lte: ["$currentStock", 0] }, 1, 0] } },
          },
        },
      ]),
      StockTransaction.find().sort({ occurredAt: -1 }).limit(8).populate("item", "name sku unit").populate("user", "name").lean(),
      PurchaseOrder.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$total" } } }]),
      PurchaseOrder.aggregate([
        { $match: { status: { $in: ["ordered", "partially_received", "received"] } } },
        { $group: { _id: "$supplier", total: { $sum: "$total" }, orders: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 6 },
        { $lookup: { from: "suppliers", localField: "_id", foreignField: "_id", as: "supplier" } },
        { $unwind: "$supplier" },
      ]),
      StockTransaction.aggregate([
        { $match: { occurredAt: { $gte: valueStart, $lt: new Date(todayStart.getTime() + ADMIN_DAY_MS) } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt", timezone: ADMIN_TIMEZONE } },
            netValue: { $sum: { $multiply: [{ $subtract: ["$stockAfter", "$stockBefore"] }, { $ifNull: ["$unitCost", 0] }] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      buildInventoryValuation(),
      getInventoryHealth({ now }),
    ]);

  const summary = summaryRows[0] || { totalItems: 0, inventoryValue: 0, lowStock: 0, outOfStock: 0 };
  summary.lowStock = health.summary.lowStock;
  summary.outOfStock = health.summary.outOfStock;
  summary.inventoryValue = valuation.summary.inventoryValue;
  const dailyChanges = new Map(valueMovementRows.map((row) => [row._id, row.netValue]));
  let rollingValue = summary.inventoryValue - valueMovementRows.reduce((sum, row) => sum + row.netValue, 0);
  const inventoryValueOverTime = Array.from({ length: 30 }, (_, index) => {
    const key = toRiyadhDateKey(new Date(valueStart.getTime() + index * ADMIN_DAY_MS));
    rollingValue += dailyChanges.get(key) || 0;
    return { date: key, value: Number(rollingValue.toFixed(2)) };
  });

  return {
    generatedAt: now,
    currency: "SAR",
    summary: {
      ...summary,
      expiringSoon: health.summary.expiringItems,
      expired: health.summary.expiredItems,
    },
    health: health.summary,
    lowStock: health.rows.filter(item => item.stockHealth.low).slice(0, 8),
    expiring: health.rows.filter(item => item.stockHealth.expiring).slice(0, 8).map(item => ({ ...item, expiryDate: [...item.expiringDates].sort((a, b) => new Date(a) - new Date(b))[0] })),
    recentActivity,
    purchaseOrders: Object.fromEntries(poRows.map((row) => [row._id, { count: row.count, total: row.total }])),
    valuation: valuation.summary,
    categoryDistribution: valuation.categoryDistribution,
    topSuppliers: supplierRows.map((row) => ({ supplier: row.supplier, total: row.total, orders: row.orders })),
    inventoryValueOverTime,
  };
};
