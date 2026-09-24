import InventoryItem from "../../models/InventoryItem.js";
import InventorySettings from "../../models/InventorySettings.js";
import PurchaseOrder from "../../models/PurchaseOrder.js";
import StockTransaction from "../../models/StockTransaction.js";
import { buildInventoryDashboard, getInventorySettings } from "../../services/inventoryAnalyticsService.js";
import { getBatchSnapshots } from "../../services/inventoryBatchService.js";
import { parsePagination, ValidationError } from "../../utils/inventoryValidation.js";
import { pickAuditFields, recordAuditLog } from "../../services/auditLogService.js";
import { buildInventoryValuation } from "../../services/inventoryValuationService.js";

export const getDashboard = async (req, res, next) => {
  try { res.json({ success: true, data: await buildInventoryDashboard() }); } catch (error) { next(error); }
};

export const getAlerts = async (req, res, next) => {
  try {
    const settings = await getInventorySettings();
    const now = new Date();
    const expiryEnd = new Date(now);
    expiryEnd.setUTCDate(expiryEnd.getUTCDate() + settings.expiryAlertDays);
    const [stock, batchRows] = await Promise.all([
      InventoryItem.find({ isActive: true, $expr: { $lte: ["$currentStock", "$reorderLevel"] } }).populate("category supplier", "name code").sort({ currentStock: 1 }).lean(),
      getBatchSnapshots({ includeDepleted: false }),
    ]);
    const expiry = batchRows
      .filter((batch) => batch.item?.isActive !== false && batch.expiryDate && new Date(batch.expiryDate) <= expiryEnd && Number(batch.remainingQuantity) > 0)
      .sort((left, right) => new Date(left.expiryDate) - new Date(right.expiryDate))
      .map((batch) => ({
        _id: batch._id,
        name: batch.item?.name || "Archived item",
        sku: batch.item?.sku || "—",
        category: batch.item?.category || null,
        supplier: batch.supplier || batch.item?.supplier || null,
        currentStock: batch.remainingQuantity,
        unit: batch.item?.unit,
        expiryDate: batch.expiryDate,
        storageLocation: batch.item?.storageLocation || "",
        lotNumber: batch.lotNumber,
      }));
    res.json({ success: true, data: { stock, expiry, expiryAlertDays: settings.expiryAlertDays } });
  } catch (error) { next(error); }
};

const dateFilter = (query, field = "occurredAt") => {
  if (!query.from && !query.to) return {};
  const range = {};
  if (query.from) range.$gte = new Date(query.from);
  if (query.to) { const to = new Date(query.to); to.setUTCHours(23, 59, 59, 999); range.$lte = to; }
  return { [field]: range };
};

export const getReport = async (req, res, next) => {
  try {
    const type = req.query.type || "valuation";
    const { page, limit, skip } = parsePagination(req.query, 50);
    let data;
    let total;
    if (type === "valuation") {
      const valuation = await buildInventoryValuation();
      total = valuation.rows.length;
      data = valuation.rows.slice(skip, skip + limit);
      return res.json({ success: true, data, summary: valuation.summary, categoryDistribution: valuation.categoryDistribution, pagination: { page, limit, total, pages: Math.ceil(total / limit) }, currency: "SAR" });
    } else if (["movement", "waste"].includes(type)) {
      const filter = { ...dateFilter(req.query) };
      if (type === "waste") filter.movementType = { $in: ["WASTE", "DAMAGED"] };
      [data, total] = await Promise.all([
        StockTransaction.find(filter).populate("item", "name sku unit").populate("user", "name").sort({ occurredAt: -1 }).skip(skip).limit(limit).lean(),
        StockTransaction.countDocuments(filter),
      ]);
    } else if (type === "purchases" || type === "supplier") {
      const filter = { ...dateFilter(req.query, "createdAt") };
      if (req.query.supplier) filter.supplier = req.query.supplier;
      [data, total] = await Promise.all([
        PurchaseOrder.find(filter).populate("supplier", "name code").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        PurchaseOrder.countDocuments(filter),
      ]);
    } else if (type === "low_stock") {
      const filter = { isActive: true, $expr: { $lte: ["$currentStock", "$reorderLevel"] } };
      [data, total] = await Promise.all([InventoryItem.find(filter).populate("category supplier", "name code").sort({ currentStock: 1 }).skip(skip).limit(limit).lean(), InventoryItem.countDocuments(filter)]);
    } else if (type === "expiry") {
      const batches = (await getBatchSnapshots({ includeDepleted: false }))
        .filter((batch) => batch.item?.isActive !== false && batch.expiryDate && Number(batch.remainingQuantity) > 0)
        .sort((left, right) => new Date(left.expiryDate) - new Date(right.expiryDate))
        .map((batch) => ({
          _id: batch._id,
          name: batch.item?.name || "Archived item",
          sku: batch.item?.sku || "—",
          currentStock: batch.remainingQuantity,
          unit: batch.item?.unit,
          expiryDate: batch.expiryDate,
          storageLocation: batch.item?.storageLocation || "",
          supplier: batch.supplier || batch.item?.supplier || null,
          category: batch.item?.category || null,
          lotNumber: batch.lotNumber,
        }));
      total = batches.length;
      data = batches.slice(skip, skip + limit);
    } else throw new ValidationError("Unknown inventory report type");
    res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) }, currency: "SAR" });
  } catch (error) { next(error); }
};

export const getSettings = async (req, res, next) => {
  try { res.json({ success: true, data: await getInventorySettings() }); } catch (error) { next(error); }
};

export const updateSettings = async (req, res, next) => {
  try {
    const beforeRow = await InventorySettings.findOne({ key: "default" }).lean();
    const payload = { updatedBy: req.user._id };
    if ("outletName" in req.body) payload.outletName = String(req.body.outletName || "").trim();
    if ("expiryAlertDays" in req.body) {
      const days = Number(req.body.expiryAlertDays);
      if (!Number.isInteger(days) || days < 1 || days > 365) throw new ValidationError("Expiry alert days must be between 1 and 365");
      payload.expiryAlertDays = days;
    }
    if ("defaultAllowNegativeStock" in req.body) payload.defaultAllowNegativeStock = Boolean(req.body.defaultAllowNegativeStock);
    const row = await InventorySettings.findOneAndUpdate({ key: "default" }, { $set: payload, $setOnInsert: { key: "default" } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
    const fields = ["outletName", "expiryAlertDays", "defaultAllowNegativeStock"];
    await recordAuditLog({ actor: req.user, action: "INVENTORY_SETTINGS_UPDATED", entityType: "InventorySettings", entityId: row._id, entityLabel: row.outletName || "Inventory settings", before: pickAuditFields(beforeRow, fields), after: pickAuditFields(row, fields) });
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
};
