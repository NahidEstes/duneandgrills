import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import InventorySettings from "../models/InventorySettings.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import StockTransaction from "../models/StockTransaction.js";

export const getInventorySettings = async () =>
  InventorySettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

const percentage = (value, total) => (total ? Number(((value / total) * 100).toFixed(1)) : 0);

export const buildInventoryDashboard = async () => {
  const settings = await getInventorySettings();
  const now = new Date();
  const expiryEnd = new Date(now);
  expiryEnd.setUTCDate(expiryEnd.getUTCDate() + settings.expiryAlertDays);
  const valueStart = new Date(now);
  valueStart.setUTCDate(valueStart.getUTCDate() - 29);

  const [summaryRows, lowStock, expiring, recentActivity, poRows, categoryRows, supplierRows, valueMovementRows] =
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
      InventoryItem.find({ isActive: true, tracksExpiry: true, expiryDate: { $ne: null, $lte: expiryEnd } })
        .select("name sku currentStock unit expiryDate")
        .sort({ expiryDate: 1 })
        .limit(8)
        .lean(),
      StockTransaction.find().sort({ occurredAt: -1 }).limit(8).populate("item", "name sku unit").populate("user", "name").lean(),
      PurchaseOrder.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$total" } } }]),
      InventoryItem.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: "$category", value: { $sum: { $multiply: ["$currentStock", "$unitCost"] } }, count: { $sum: 1 } } },
        { $lookup: { from: InventoryCategory.collection.name, localField: "_id", foreignField: "_id", as: "category" } },
        { $unwind: "$category" },
        { $sort: { value: -1 } },
      ]),
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
        { $lookup: { from: InventoryItem.collection.name, localField: "item", foreignField: "_id", as: "itemData" } },
        { $unwind: "$itemData" },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt" } },
            netValue: { $sum: { $multiply: [{ $subtract: ["$stockAfter", "$stockBefore"] }, "$itemData.unitCost"] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

  const summary = summaryRows[0] || { totalItems: 0, inventoryValue: 0, lowStock: 0, outOfStock: 0 };
  const categoryTotal = categoryRows.reduce((sum, row) => sum + row.value, 0);
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
    categoryDistribution: categoryRows.map((row) => ({
      category: row.category.name,
      color: row.category.color,
      value: row.value,
      count: row.count,
      percentage: percentage(row.value, categoryTotal),
    })),
    topSuppliers: supplierRows.map((row) => ({ supplier: row.supplier, total: row.total, orders: row.orders })),
    inventoryValueOverTime,
  };
};
