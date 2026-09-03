import InventoryItem from "../../models/InventoryItem.js";
import StockTransaction from "../../models/StockTransaction.js";
import User from "../../models/User.js";
import { performStockMovement, runInventoryTransaction } from "../../services/inventoryStockService.js";
import { escapeRegex, parsePagination, validateWastePayload } from "../../utils/inventoryValidation.js";

const endOfDay = (value) => {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

const wasteFilter = async (query) => {
  const filter = { movementType: { $in: ["WASTE", "DAMAGED"] } };
  if (query.item) filter.item = query.item;
  if (query.user) filter.user = query.user;
  if (query.reasonCode) filter.reasonCode = query.reasonCode;
  if (query.from || query.to) {
    filter.occurredAt = {};
    if (query.from) filter.occurredAt.$gte = new Date(query.from);
    if (query.to) filter.occurredAt.$lte = endOfDay(query.to);
  }
  if (query.category) {
    const ids = await InventoryItem.find({ category: query.category }).distinct("_id");
    filter.item = filter.item ? { $in: ids.filter((id) => String(id) === String(filter.item)) } : { $in: ids };
  }
  if (query.search?.trim()) {
    const value = new RegExp(escapeRegex(query.search.trim()), "i");
    const itemIds = await InventoryItem.find({ $or: [{ name: value }, { sku: value }] }).distinct("_id");
    filter.$or = [{ item: { $in: itemIds } }, { reason: value }, { notes: value }, { reference: value }];
  }
  return filter;
};

const withCostImpact = (row) => ({
  ...row,
  costImpact: Number((Number(row.quantity || 0) * Number(row.unitCost ?? row.item?.unitCost ?? 0)).toFixed(2)),
});

export const createWasteRecord = async (req, res, next) => {
  try {
    const payload = validateWastePayload(req.body);
    const result = await runInventoryTransaction((session) => performStockMovement({
      itemId: payload.item,
      movementType: payload.movementType,
      quantity: payload.quantity,
      reason: payload.reason,
      reasonCode: payload.reasonCode,
      notes: payload.notes,
      occurredAt: payload.occurredAt,
      userId: req.user._id,
      allowNegativeStock: false,
      respectItemNegativeStock: false,
    }, { session }));
    await result.transaction.populate([
      { path: "item", select: "name sku unit unitCost category", populate: { path: "category", select: "name" } },
      { path: "user", select: "name email" },
    ]);
    res.status(201).json({ success: true, data: withCostImpact(result.transaction.toObject()) });
  } catch (error) { next(error); }
};

export const listWasteRecords = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 20);
    const filter = await wasteFilter(req.query);
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
    const [rows, total, summaryRows, reasonRows, recentRows, userIds] = await Promise.all([
      StockTransaction.find(filter)
        .populate({ path: "item", select: "name sku unit unitCost category", populate: { path: "category", select: "name" } })
        .populate("user", "name email role")
        .sort({ occurredAt: -1 }).skip(skip).limit(limit).lean(),
      StockTransaction.countDocuments(filter),
      StockTransaction.aggregate([
        { $match: { movementType: { $in: ["WASTE", "DAMAGED"] }, occurredAt: { $gte: weekStart } } },
        { $group: {
          _id: null,
          weekQuantity: { $sum: "$quantity" },
          weekCost: { $sum: { $multiply: ["$quantity", { $ifNull: ["$unitCost", 0] }] } },
          todayQuantity: { $sum: { $cond: [{ $gte: ["$occurredAt", todayStart] }, "$quantity", 0] } },
          todayCost: { $sum: { $cond: [{ $gte: ["$occurredAt", todayStart] }, { $multiply: ["$quantity", { $ifNull: ["$unitCost", 0] }] }, 0] } },
        } },
      ]),
      StockTransaction.aggregate([
        { $match: { movementType: { $in: ["WASTE", "DAMAGED"] }, occurredAt: { $gte: weekStart } } },
        { $group: { _id: { $ifNull: ["$reasonCode", "OTHER"] }, quantity: { $sum: "$quantity" }, cost: { $sum: { $multiply: ["$quantity", { $ifNull: ["$unitCost", 0] }] } }, count: { $sum: 1 } } },
        { $sort: { cost: -1 } },
      ]),
      StockTransaction.find({ movementType: { $in: ["WASTE", "DAMAGED"] } })
        .populate("item", "name sku unit").populate("user", "name")
        .sort({ occurredAt: -1 }).limit(5).lean(),
      StockTransaction.distinct("user", { movementType: { $in: ["WASTE", "DAMAGED"] } }),
    ]);
    const users = await User.find({ _id: { $in: userIds } }).select("name role").sort({ name: 1 }).lean();
    const topItemRows = await StockTransaction.aggregate([
      { $match: { movementType: { $in: ["WASTE", "DAMAGED"] }, occurredAt: { $gte: weekStart } } },
      { $group: { _id: "$item", quantity: { $sum: "$quantity" }, cost: { $sum: { $multiply: ["$quantity", { $ifNull: ["$unitCost", 0] }] } } } },
      { $sort: { cost: -1 } }, { $limit: 1 },
      { $lookup: { from: InventoryItem.collection.name, localField: "_id", foreignField: "_id", as: "item" } },
      { $unwind: { path: "$item", preserveNullAndEmptyArrays: true } },
    ]);
    res.json({
      success: true,
      data: rows.map(withCostImpact),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      summary: { ...(summaryRows[0] || { weekQuantity: 0, weekCost: 0, todayQuantity: 0, todayCost: 0 }), topItem: topItemRows[0] || null },
      reasonBreakdown: reasonRows,
      recentActivity: recentRows.map(withCostImpact),
      filters: { users },
      currency: "SAR",
    });
  } catch (error) { next(error); }
};
