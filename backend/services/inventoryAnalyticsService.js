import InventoryItem from "../models/InventoryItem.js";
import InventorySettings from "../models/InventorySettings.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import StockTransaction from "../models/StockTransaction.js";
import { getBatchSnapshots } from "./inventoryBatchService.js";
import { buildInventoryValuation } from "./inventoryValuationService.js";

export const getInventorySettings = async () =>
  InventorySettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

export const buildInventoryDashboard = async () => {
  const settings = await getInventorySettings();
  const now = new Date();
  const expiryEnd = new Date(now);
  expiryEnd.setUTCDate(expiryEnd.getUTCDate() + settings.expiryAlertDays);
  const valueStart = new Date(now);
  valueStart.setUTCDate(valueStart.getUTCDate() - 29);

  const [summaryRows, lowStock, expiring, recentActivity, poRows, supplierRows, valueMovementRows, valuation] =
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
      InventoryItem.find({ isActive: true, $expr: { $lte: ["$currentStock", "$reorderLevel"] } })
        .select("name sku currentStock reorderLevel unit")
        .sort({ currentStock: 1 })
        .limit(8)
        .lean(),
      getBatchSnapshots({ includeDepleted: false }).then((rows) => rows
        .filter((batch) => batch.item?.isActive !== false && batch.expiryDate && new Date(batch.expiryDate) <= expiryEnd && Number(batch.remainingQuantity) > 0)
        .sort((left, right) => new Date(left.expiryDate) - new Date(right.expiryDate))
        .slice(0, 8)
        .map((batch) => ({
          _id: batch._id,
          name: batch.item?.name || "Archived item",
          sku: batch.item?.sku || "—",
          currentStock: batch.remainingQuantity,
          unit: batch.item?.unit,
          expiryDate: batch.expiryDate,
          lotNumber: batch.lotNumber,
        }))),
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
        { $match: { occurredAt: { $gte: valueStart } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt" } },
            netValue: { $sum: { $multiply: [{ $subtract: ["$stockAfter", "$stockBefore"] }, { $ifNull: ["$unitCost", 0] }] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      buildInventoryValuation(),
    ]);

  const summary = summaryRows[0] || { totalItems: 0, inventoryValue: 0, lowStock: 0, outOfStock: 0 };
  summary.inventoryValue = valuation.summary.inventoryValue;
  const dailyChanges = new Map(valueMovementRows.map((row) => [row._id, row.netValue]));
  let rollingValue = summary.inventoryValue - valueMovementRows.reduce((sum, row) => sum + row.netValue, 0);
  const inventoryValueOverTime = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(valueStart);
    date.setUTCDate(valueStart.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    rollingValue += dailyChanges.get(key) || 0;
    return { date: key, value: Number(rollingValue.toFixed(2)) };
  });

  return {
    generatedAt: now,
    currency: "SAR",
    summary: {
      ...summary,
      expiringSoon: expiring.filter((item) => new Date(item.expiryDate) >= now).length,
      expired: expiring.filter((item) => new Date(item.expiryDate) < now).length,
    },
    lowStock,
    expiring,
    recentActivity,
    purchaseOrders: Object.fromEntries(poRows.map((row) => [row._id, { count: row.count, total: row.total }])),
    valuation: valuation.summary,
    categoryDistribution: valuation.categoryDistribution,
    topSuppliers: supplierRows.map((row) => ({ supplier: row.supplier, total: row.total, orders: row.orders })),
    inventoryValueOverTime,
  };
};
