import Counter from "../../models/Counter.js";
import InventoryCount from "../../models/InventoryCount.js";
import InventoryItem from "../../models/InventoryItem.js";
import StockTransaction from "../../models/StockTransaction.js";
import { performStockMovement, runInventoryTransaction } from "../../services/inventoryStockService.js";
import { parsePagination, validateMovementPayload, ValidationError } from "../../utils/inventoryValidation.js";

export const createMovement = async (req, res, next) => {
  try {
    const payload = validateMovementPayload(req.body);
    const result = await runInventoryTransaction((session) =>
      performStockMovement(
        {
          itemId: payload.item,
          movementType: payload.movementType,
          quantity: payload.quantity,
          reason: payload.reason,
          notes: payload.notes,
          userId: req.user._id,
          allowNegativeStock: payload.allowNegativeStock,
          unitCost: req.body.unitCost,
          expiryDate: req.body.expiryDate,
        },
        { session }
      )
    );
    await result.item.populate([{ path: "category", select: "name color" }, { path: "supplier", select: "name code" }]);
    await result.transaction.populate([{ path: "item", select: "name sku unit" }, { path: "user", select: "name" }]);
    res.status(201).json({ success: true, data: result });
  } catch (error) { next(error); }
};

export const listMovements = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 25);
    const filter = {};
    if (req.query.item) filter.item = req.query.item;
    if (req.query.movementType) filter.movementType = req.query.movementType;
    if (req.query.from || req.query.to) {
      filter.occurredAt = {};
      if (req.query.from) filter.occurredAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const to = new Date(req.query.to);
        to.setUTCHours(23, 59, 59, 999);
        filter.occurredAt.$lte = to;
      }
    }
    const [rows, total] = await Promise.all([
      StockTransaction.find(filter)
        .populate("item", "name sku unit")
        .populate("user", "name email")
        .populate("purchaseOrder", "orderNumber")
        .sort({ occurredAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StockTransaction.countDocuments(filter),
    ]);
    res.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

const nextCountNumber = async () => {
  const year = new Date().getUTCFullYear();
  const counter = await Counter.findOneAndUpdate({ _id: `inventory-count-${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `IC-${year}-${String(counter.seq).padStart(4, "0")}`;
};

export const listCounts = async (req, res, next) => {
  try {
    const rows = await InventoryCount.find().populate("createdBy completedBy", "name").sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

export const createCount = async (req, res, next) => {
  try {
    const filter = { isActive: true };
    if (Array.isArray(req.body.itemIds) && req.body.itemIds.length) filter._id = { $in: req.body.itemIds };
    if (req.body.category) filter.category = req.body.category;
    const items = await InventoryItem.find(filter).sort({ name: 1 }).lean();
    if (!items.length) throw new ValidationError("No active items matched this inventory count");
    const row = await InventoryCount.create({
      countNumber: await nextCountNumber(),
      status: "in_progress",
      items: items.map((item) => ({ item: item._id, itemName: item.name, sku: item.sku, expectedQuantity: item.currentStock })),
      notes: typeof req.body.notes === "string" ? req.body.notes.trim() : "",
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const completeCount = async (req, res, next) => {
  try {
    const result = await runInventoryTransaction(async (session) => {
      const count = await InventoryCount.findById(req.params.id).session(session || null);
      if (!count) throw new ValidationError("Inventory count was not found");
      if (count.status !== "in_progress") throw new ValidationError("Only in-progress counts can be completed");
      const submitted = new Map((req.body.items || []).map((line) => [String(line.lineId), line]));
      if (submitted.size !== count.items.length) throw new ValidationError("A counted quantity is required for every item");
      const movements = [];
      for (const line of count.items) {
        const input = submitted.get(String(line._id));
        const counted = Number(input?.countedQuantity);
        if (!Number.isFinite(counted) || counted < 0) throw new ValidationError(`Counted quantity for ${line.itemName} must be zero or greater`);
        line.countedQuantity = counted;
        line.variance = counted - line.expectedQuantity;
        line.notes = typeof input.notes === "string" ? input.notes.trim() : "";
        if (line.variance !== 0) {
          const movement = await performStockMovement(
            {
              itemId: line.item,
              movementType: "INVENTORY_COUNT",
              quantity: counted,
              reason: `Inventory count ${count.countNumber}`,
              notes: line.notes,
              userId: req.user._id,
              inventoryCount: count._id,
            },
            { session }
          );
          movements.push(movement.transaction);
        }
      }
      count.status = "completed";
      count.completedBy = req.user._id;
      count.completedAt = new Date();
      await count.save({ session: session || undefined });
      return { count, movements };
    });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

export const cancelCount = async (req, res, next) => {
  try {
    const row = await InventoryCount.findOneAndUpdate({ _id: req.params.id, status: { $in: ["draft", "in_progress"] } }, { status: "cancelled" }, { new: true });
    if (!row) return res.status(404).json({ success: false, message: "Open inventory count not found" });
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
};
