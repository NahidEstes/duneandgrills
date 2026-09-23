import Counter from "../../models/Counter.js";
import InventoryCount from "../../models/InventoryCount.js";
import InventoryItem from "../../models/InventoryItem.js";
import StockTransaction from "../../models/StockTransaction.js";
import Supplier from "../../models/Supplier.js";
import User from "../../models/User.js";
import { performStockMovement, runInventoryTransaction } from "../../services/inventoryStockService.js";
import { getPurchaseConfiguration, toBaseQuantity, toBaseUnitCost } from "../../services/inventoryUnitService.js";
import { escapeRegex, parsePagination, validateMovementPayload, ValidationError } from "../../utils/inventoryValidation.js";
import { recordAuditLog } from "../../services/auditLogService.js";
import { hasCapability, CAPABILITIES } from "../../config/permissions.js";

export const createMovement = async (req, res, next) => {
  try {
    const payload = validateMovementPayload(req.body);
    const selectedItem = await InventoryItem.findById(payload.item);
    if (!selectedItem || !selectedItem.isActive) throw new ValidationError("Inventory item was not found or is inactive");
    if (payload.supplier && !(await Supplier.exists({ _id: payload.supplier, isActive: true }))) {
      throw new ValidationError("Supplier was not found or is inactive");
    }
    const inbound = payload.movementType === "STOCK_IN";
    const purchaseConfig = getPurchaseConfiguration(selectedItem);
    const movementQuantity = inbound
      ? toBaseQuantity(payload.quantity, purchaseConfig.conversionFactor)
      : payload.quantity;
    const movementUnitCost = inbound && payload.unitCost != null
      ? toBaseUnitCost(payload.unitCost, purchaseConfig.conversionFactor)
      : payload.unitCost;
    const result = await runInventoryTransaction((session) =>
      performStockMovement(
        {
          itemId: payload.item,
          movementType: payload.movementType,
          quantity: movementQuantity,
          reason: payload.reason,
          notes: payload.notes,
          userId: req.user._id,
          allowNegativeStock: payload.allowNegativeStock,
          unitCost: movementUnitCost,
          expiryDate: payload.expiryDate,
          lotNumber: payload.lotNumber,
          receivedAt: payload.receivedAt,
          supplier: payload.supplier || selectedItem.supplier,
          purchaseQuantity: inbound ? payload.quantity : null,
          purchaseUnit: inbound ? purchaseConfig.purchaseUnit : null,
          conversionFactor: inbound ? purchaseConfig.conversionFactor : 1,
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
    if (req.query.user) filter.user = req.query.user;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.movementType) {
      const types = String(req.query.movementType).split(",").filter(Boolean);
      filter.movementType = types.length > 1 ? { $in: types } : types[0];
    }
    if (req.query.from || req.query.to) {
      filter.occurredAt = {};
      if (req.query.from) filter.occurredAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const to = new Date(req.query.to);
        to.setUTCHours(23, 59, 59, 999);
        filter.occurredAt.$lte = to;
      }
    }
    if (req.query.search?.trim()) {
      const value = new RegExp(escapeRegex(req.query.search.trim()), "i");
      const itemIds = await InventoryItem.find({ $or: [{ name: value }, { sku: value }] }).distinct("_id");
      filter.$or = [{ item: { $in: itemIds } }, { reason: value }, { notes: value }, { reference: value }];
    }
    const summaryFilter = { ...filter };
    delete summaryFilter.movementType;
    const [rows, total, summaryRows, userIds] = await Promise.all([
      StockTransaction.find(filter)
        .populate({ path: "item", select: "name sku unit category", populate: { path: "category", select: "name" } })
        .populate("user", "name email role")
        .populate("purchaseOrder", "orderNumber")
        .populate("inventoryCount", "countNumber")
        .sort({ occurredAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StockTransaction.countDocuments(filter),
      StockTransaction.aggregate([
        { $match: summaryFilter },
        { $group: { _id: "$movementType", count: { $sum: 1 }, quantity: { $sum: "$quantity" } } },
      ]),
      StockTransaction.distinct("user", summaryFilter),
    ]);
    const users = await User.find({ _id: { $in: userIds } }).select("name role").sort({ name: 1 }).lean();
    const byType = Object.fromEntries(summaryRows.map((row) => [row._id, { count: row.count, quantity: row.quantity }]));
    const summary = {
      total: summaryRows.reduce((sum, row) => sum + row.count, 0),
      stockIn: (byType.STOCK_IN?.count || 0) + (byType.PURCHASE_RECEIPT?.count || 0) + (byType.OPENING_BALANCE?.count || 0),
      stockOut: byType.STOCK_OUT?.count || 0,
      adjustments: (byType.ADJUSTMENT?.count || 0) + (byType.INVENTORY_COUNT?.count || 0),
      wasteDamaged: (byType.WASTE?.count || 0) + (byType.DAMAGED?.count || 0),
      byType,
    };
    res.json({ success: true, data: rows, summary, filters: { users }, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

const nextCountNumber = async () => {
  const year = new Date().getUTCFullYear();
  const counter = await Counter.findOneAndUpdate({ _id: `inventory-count-${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `IC-${year}-${String(counter.seq).padStart(4, "0")}`;
};

export const listCounts = async (req, res, next) => {
  try {
    const rows = await InventoryCount.find().populate("createdBy completedBy reviewedBy", "name").sort({ createdAt: -1 }).lean();
    if (!hasCapability(req.user.role, CAPABILITIES.INVENTORY_COUNT_APPROVE)) {
      for (const count of rows) if (count.blindCount && count.status === "in_progress") {
        count.items = count.items.map(({ expectedQuantity: _expectedQuantity, expectedStockVersion: _expectedStockVersion, ...line }) => line);
      }
    }
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
      items: items.map((item) => ({ item: item._id, itemName: item.name, sku: item.sku, expectedQuantity: item.currentStock, expectedStockVersion: Number(item.stockVersion || 0) })),
      blindCount: req.body.blindCount === true,
      notes: typeof req.body.notes === "string" ? req.body.notes.trim() : "",
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const submitCount = async (req, res, next) => {
  try {
    const count = await InventoryCount.findOne({ _id: req.params.id, status: "in_progress" });
    if (!count) return res.status(404).json({ success: false, message: "Open inventory count was not found" });
    const submitted = new Map((req.body.items || []).map((line) => [String(line.lineId), line]));
    if (submitted.size !== count.items.length) throw new ValidationError("A counted quantity is required for every item");
    const currentItems = await InventoryItem.find({ _id: { $in: count.items.map((line) => line.item) } }).lean();
    const currentById = new Map(currentItems.map((item) => [String(item._id), item]));
    for (const line of count.items) {
      const input = submitted.get(String(line._id));
      const counted = Number(input?.countedQuantity);
      if (!Number.isFinite(counted) || counted < 0) throw new ValidationError(`Counted quantity for ${line.itemName} must be zero or greater`);
      line.countedQuantity = counted;
      line.variance = counted - line.expectedQuantity;
      line.notes = typeof input.notes === "string" ? input.notes.trim() : "";
      const current = currentById.get(String(line.item));
      line.conflict = !current || Number(current.stockVersion || 0) !== Number(line.expectedStockVersion || 0) || Number(current.currentStock) !== Number(line.expectedQuantity);
      line.conflictReason = line.conflict ? (!current ? "Inventory item is no longer available" : `Stock changed after counting started (${line.expectedQuantity} to ${current.currentStock})`) : "";
    }
    count.status = "review_required";
    await count.save();
    await recordAuditLog({ actor: req.user, action: "INVENTORY_COUNT_SUBMITTED", entityType: "InventoryCount", entityId: count._id, entityLabel: count.countNumber, metadata: { conflicts: count.items.filter((line) => line.conflict).length } });
    res.json({ success: true, data: count });
  } catch (error) { next(error); }
};

export const completeCount = async (req, res, next) => {
  try {
    const result = await runInventoryTransaction(async (session) => {
      const count = await InventoryCount.findById(req.params.id).session(session || null);
      if (!count) throw new ValidationError("Inventory count was not found");
      if (!["in_progress", "review_required"].includes(count.status)) throw new ValidationError("Only open counts can be completed");
      const submitted = new Map((req.body.items || []).map((line) => [String(line.lineId), line]));
      if (submitted.size && submitted.size !== count.items.length) throw new ValidationError("A counted quantity is required for every item");
      const currentItems = await InventoryItem.find({ _id: { $in: count.items.map((line) => line.item) } }).session(session || null);
      const currentById = new Map(currentItems.map((item) => [String(item._id), item]));
      const conflicts = [];
      for (const line of count.items) {
        line.conflict = false;
        line.conflictReason = "";
        const current = currentById.get(String(line.item));
        if (!current || Number(current.stockVersion || 0) !== Number(line.expectedStockVersion || 0) || Number(current.currentStock) !== Number(line.expectedQuantity)) {
          line.conflict = true;
          line.conflictReason = !current ? "Inventory item is no longer available" : `Stock changed after counting started (${line.expectedQuantity} to ${current.currentStock})`;
          conflicts.push({ lineId: line._id, item: line.item, itemName: line.itemName, reason: line.conflictReason });
        }
      }
      if (conflicts.length) {
        count.status = "review_required";
        await count.save({ session: session || undefined });
        await recordAuditLog({ actor: req.user, action: "INVENTORY_COUNT_CONFLICT", entityType: "InventoryCount", entityId: count._id, entityLabel: count.countNumber, metadata: { conflicts } }, { session });
        return { count, movements: [], conflicts };
      }
      const movements = [];
      for (const line of count.items) {
        const input = submitted.get(String(line._id));
        const counted = Number(input?.countedQuantity ?? line.countedQuantity);
        if (!Number.isFinite(counted) || counted < 0) throw new ValidationError(`Counted quantity for ${line.itemName} must be zero or greater`);
        line.countedQuantity = counted;
        line.variance = counted - line.expectedQuantity;
        line.appliedAdjustment = line.variance;
        line.notes = typeof input?.notes === "string" ? input.notes.trim() : line.notes;
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
              reference: count.countNumber,
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
      await recordAuditLog({ actor: req.user, action: "INVENTORY_COUNT_COMPLETED", entityType: "InventoryCount", entityId: count._id, entityLabel: count.countNumber, metadata: { items: count.items.map((line) => ({ item: line.item, previousQuantity: line.expectedQuantity, countedQuantity: line.countedQuantity, appliedAdjustment: line.appliedAdjustment })), approvedBy: req.user._id } }, { session });
      return { count, movements };
    });
    res.status(result.conflicts?.length ? 409 : 200).json({ success: !result.conflicts?.length, ...(result.conflicts?.length ? { message: "Stock changed after this count started. Review and recount the affected items." } : {}), data: result });
  } catch (error) { next(error); }
};

export const reviewCount = async (req, res, next) => {
  try {
    const count = await InventoryCount.findOne({ _id: req.params.id, status: "review_required" });
    if (!count) return res.status(404).json({ success: false, message: "Inventory count awaiting review was not found" });
    const currentItems = await InventoryItem.find({ _id: { $in: count.items.map((line) => line.item) } }).lean();
    const currentById = new Map(currentItems.map((item) => [String(item._id), item]));
    for (const line of count.items) {
      const current = currentById.get(String(line.item));
      if (!current) continue;
      line.expectedQuantity = current.currentStock;
      line.expectedStockVersion = Number(current.stockVersion || 0);
      line.countedQuantity = null;
      line.variance = null;
      line.appliedAdjustment = null;
      line.conflict = false;
      line.conflictReason = "";
    }
    count.status = "in_progress";
    count.reviewedBy = req.user._id;
    count.reviewedAt = new Date();
    await count.save();
    await recordAuditLog({ actor: req.user, action: "INVENTORY_COUNT_RECOUNT_REQUESTED", entityType: "InventoryCount", entityId: count._id, entityLabel: count.countNumber });
    res.json({ success: true, data: count });
  } catch (error) { next(error); }
};

export const cancelCount = async (req, res, next) => {
  try {
    const row = await InventoryCount.findOneAndUpdate({ _id: req.params.id, status: { $in: ["draft", "in_progress", "review_required"] } }, { status: "cancelled" }, { new: true });
    if (!row) return res.status(404).json({ success: false, message: "Open inventory count not found" });
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
};
