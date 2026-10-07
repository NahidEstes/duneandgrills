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
import { pickAuditFields, recordAuditLog } from "../../services/auditLogService.js";
import { buildInventoryValuation } from "../../services/inventoryValuationService.js";
import { refreshAffectedSuggestions } from "../../services/reorderService.js";
import { getInventoryHealth, INVENTORY_HEALTH_FILTERS } from "../../services/inventoryHealthService.js";

const AUDIT_FIELDS = ["name", "sku", "category", "unit", "purchaseUnit", "purchaseConversionFactor", "reorderLevel", "reorderEnabled", "targetStock", "safetyStock", "leadTimeDays", "minimumOrderQuantity", "orderMultiple", "supplierItemCode", "preferredBrand", "unitCost", "supplier", "tracksExpiry", "storageLocation", "isActive", "allowNegativeStock"];

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
      filter.$or = [{ name: value }, { sku: value }, { storageLocation: value }, { preferredBrand: value }];
    }
    if (req.query.category) filter.category = req.query.category;
    if (req.query.supplier) filter.supplier = req.query.supplier;
    if (req.query.status === "active") filter.isActive = true;
    if (req.query.status === "inactive") filter.isActive = false;
    const healthFilter = INVENTORY_HEALTH_FILTERS.includes(req.query.status) ? req.query.status : null;
    if (healthFilter) filter.isActive = true;
    if (!req.query.status) filter.isActive = true;

    const allowedSorts = new Set(["name", "sku", "currentStock", "reorderLevel", "unitCost", "updatedAt"]);
    const sortBy = allowedSorts.has(req.query.sortBy) ? req.query.sortBy : "updatedAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    let items, total;
    if (healthFilter) {
      const matching = await InventoryItem.find(filter).populate(itemPopulate).sort({ [sortBy]: sortOrder }).lean();
      const health = await getInventoryHealth({ items: matching });
      const filtered = health.rows.filter(item => item.stockHealth[healthFilter]);
      total = filtered.length; items = filtered.slice(skip, skip + limit);
    } else {
      const result = await Promise.all([
        InventoryItem.find(filter).populate(itemPopulate).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit).lean(),
        InventoryItem.countDocuments(filter),
      ]);
      total = result[1]; items = (await getInventoryHealth({ items: result[0] })).rows;
    }
    const valuation = items.length ? await buildInventoryValuation({ itemIds: items.map((item) => item._id) }) : { rows: [] };
    const valueById = new Map(valuation.rows.map((item) => [String(item._id), item]));
    res.json({ success: true, data: items.map((item) => ({ ...item, ...valueById.get(String(item._id)) })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
};

export const getItem = async (req, res, next) => {
  try {
    const item = await InventoryItem.findById(req.params.id).populate(itemPopulate).lean();
    if (!item) return res.status(404).json({ success: false, message: "Inventory item not found" });
    res.json({ success: true, data: (await getInventoryHealth({ items: [item] })).rows[0] });
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
          await recordAuditLog({ actor: req.user, action: "INVENTORY_ITEM_CREATED", entityType: "InventoryItem", entityId: created._id, entityLabel: created.sku, correlationId: req.correlationId, after: pickAuditFields(created, AUDIT_FIELDS), related: { category: created.category, supplier: created.supplier } }, { session });
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
      await recordAuditLog({ actor: req.user, action: "INVENTORY_SKU_CHANGE_REJECTED", entityType: "InventoryItem", entityId: item._id, entityLabel: item.sku, correlationId: req.correlationId, before: { sku: item.sku }, after: { attemptedSku: String(req.body.sku || "").trim().toUpperCase() }, reason: "SKU is immutable" });
      throw new ValidationError("SKU is stable after item creation and cannot be changed");
    }
    const payload = validateItemPayload(req.body, { partial: true });
    delete payload.openingStock;
    delete payload.sku;
    const before = pickAuditFields(item, AUDIT_FIELDS);
    await ensureReferences(payload);
    if (payload.unit && payload.unit !== item.unit && Number(item.currentStock) !== 0) {
      throw new ValidationError("Base unit cannot be changed while this item has stock. Reconcile it to zero first");
    }
    await runInventoryTransaction(async (session) => {
      await ensureReferences(payload, session);
      Object.assign(item, payload);
      item.purchaseUnit ||= item.unit;
      if (item.purchaseUnit === item.unit) item.purchaseConversionFactor = 1;
      await item.save(session ? { session } : {});
      await recordAuditLog({ actor: req.user, action: "INVENTORY_ITEM_UPDATED", entityType: "InventoryItem", entityId: item._id, entityLabel: item.sku, correlationId: req.correlationId, before, after: pickAuditFields(item, AUDIT_FIELDS), reason: String(req.body.reason || "").trim() }, { session });
    });
    await item.populate(itemPopulate);
    const valuation = await buildInventoryValuation({ itemIds: [item._id] });
    await refreshAffectedSuggestions([item._id]);
    res.json({ success: true, data: { ...item, ...(valuation.rows[0] || {}) } });
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
    await runInventoryTransaction(async (session) => {
      const before = pickAuditFields(item, AUDIT_FIELDS);
      item.isActive = false;
      await item.save(session ? { session } : {});
      await recordAuditLog({ actor: req.user, action: "INVENTORY_ITEM_ARCHIVED", entityType: "InventoryItem", entityId: item._id, entityLabel: item.sku, correlationId: req.correlationId, before, after: pickAuditFields(item, AUDIT_FIELDS), reason: String(req.body?.reason || "").trim() }, { session });
    });
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
