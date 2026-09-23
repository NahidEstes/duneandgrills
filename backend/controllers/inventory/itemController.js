import InventoryCategory from "../../models/InventoryCategory.js";
import InventoryItem from "../../models/InventoryItem.js";
import StockTransaction from "../../models/StockTransaction.js";
import Supplier from "../../models/Supplier.js";
import { createOpeningBalance, runInventoryTransaction } from "../../services/inventoryStockService.js";
import {
  escapeRegex,
  parsePagination,
  validateItemPayload,
  ValidationError,
} from "../../utils/inventoryValidation.js";
import {
  advanceInventorySkuCounter,
  peekNextInventorySku,
  reserveNextInventorySku,
} from "../../services/inventorySkuService.js";

const itemPopulate = [
  { path: "category", select: "name color isActive skuPrefix" },
  { path: "supplier", select: "name code isActive" },
];

const ensureReferences = async ({ category, supplier }, session = null) => {
  if (category) {
    const exists = await InventoryCategory.exists({ _id: category, isActive: true }).session(session || null);
    if (!exists) throw new ValidationError("Category was not found or is inactive");
  }
  if (supplier) {
    const exists = await Supplier.exists({ _id: supplier, isActive: true }).session(session || null);
    if (!exists) throw new ValidationError("Supplier was not found or is inactive");
  }
};

export const listItems = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    const search = req.query.search?.trim();
    if (search) {
      const value = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: value }, { sku: value }, { storageLocation: value }];
    }
    if (req.query.category) filter.category = req.query.category;
    if (req.query.supplier) filter.supplier = req.query.supplier;
    if (req.query.status === "active") filter.isActive = true;
    if (req.query.status === "inactive") filter.isActive = false;
    if (req.query.status === "out") Object.assign(filter, { isActive: true, currentStock: { $lte: 0 } });
    if (req.query.status === "low") Object.assign(filter, { isActive: true, currentStock: { $gt: 0 }, $expr: { $lte: ["$currentStock", "$reorderLevel"] } });
    if (!req.query.status) filter.isActive = true;

    const allowedSorts = new Set(["name", "sku", "currentStock", "reorderLevel", "unitCost", "updatedAt"]);
    const sortBy = allowedSorts.has(req.query.sortBy) ? req.query.sortBy : "updatedAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const [items, total] = await Promise.all([
      InventoryItem.find(filter).populate(itemPopulate).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit).lean(),
      InventoryItem.countDocuments(filter),
    ]);
    res.json({ success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
};

export const getItem = async (req, res, next) => {
  try {
    const item = await InventoryItem.findById(req.params.id).populate(itemPopulate).lean();
    if (!item) return res.status(404).json({ success: false, message: "Inventory item not found" });
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

export const createItem = async (req, res, next) => {
  try {
    const automatic = req.body.autoGenerateSku === true || !String(req.body.sku || "").trim();
    let item;
    let lastCollision;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const sku = automatic
        ? (await reserveNextInventorySku(req.body.category)).sku
        : String(req.body.sku || "").trim().toUpperCase();
      const payload = validateItemPayload({ ...req.body, sku });
      payload.purchaseUnit ||= payload.unit;
      if (payload.purchaseUnit === payload.unit) payload.purchaseConversionFactor = 1;
      try {
        item = await runInventoryTransaction(async (session) => {
          await ensureReferences(payload, session);
          const openingStock = payload.openingStock || 0;
          delete payload.openingStock;
          const [created] = await InventoryItem.create([{ ...payload, currentStock: 0 }], session ? { session } : {});
          await createOpeningBalance(created, openingStock, req.user._id, session);
          return created;
        });
        if (!automatic) await advanceInventorySkuCounter(payload.category, payload.sku);
        break;
      } catch (error) {
        if (automatic && error?.code === 11000) {
          lastCollision = error;
          continue;
        }
        throw error;
      }
    }
    if (!item) throw lastCollision || new ValidationError("Unable to reserve a unique inventory SKU. Please try again");
    const populated = await InventoryItem.findById(item._id).populate(itemPopulate).lean();
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "An inventory item with this SKU already exists" });
    next(error);
  }
};

export const updateItem = async (req, res, next) => {
  try {
    const item = await InventoryItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: "Inventory item not found" });
    if ("sku" in req.body && String(req.body.sku || "").trim().toUpperCase() !== item.sku) {
      throw new ValidationError("SKU is stable after item creation and cannot be changed");
    }
    const payload = validateItemPayload(req.body, { partial: true });
    delete payload.openingStock;
    delete payload.sku;
    await ensureReferences(payload);
    if (payload.unit && payload.unit !== item.unit && Number(item.currentStock) !== 0) {
      throw new ValidationError("Base unit cannot be changed while this item has stock. Reconcile it to zero first");
    }
    Object.assign(item, payload);
    item.purchaseUnit ||= item.unit;
    if (item.purchaseUnit === item.unit) item.purchaseConversionFactor = 1;
    await item.save();
    await item.populate(itemPopulate);
    res.json({ success: true, data: item });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "An inventory item with this SKU already exists" });
    next(error);
  }
};

export const suggestItemSku = async (req, res, next) => {
  try {
    const suggestion = await peekNextInventorySku(req.params.categoryId);
    res.json({ success: true, data: suggestion });
  } catch (error) { next(error); }
};

export const archiveItem = async (req, res, next) => {
  try {
    const item = await InventoryItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: "Inventory item not found" });
    item.isActive = false;
    await item.save();
    res.json({ success: true, message: "Inventory item archived. Its transaction history was preserved." });
  } catch (error) {
    next(error);
  }
};

export const itemHistory = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 25);
    const filter = { item: req.params.id };
    const [rows, total] = await Promise.all([
      StockTransaction.find(filter).populate("user", "name email").sort({ occurredAt: -1 }).skip(skip).limit(limit).lean(),
      StockTransaction.countDocuments(filter),
    ]);
    res.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
};
