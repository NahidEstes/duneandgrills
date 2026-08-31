import InventoryItem from "../../models/InventoryItem.js";
import InventorySettings from "../../models/InventorySettings.js";
import PurchaseOrder from "../../models/PurchaseOrder.js";
import StockTransaction from "../../models/StockTransaction.js";
import { buildInventoryDashboard, getInventorySettings } from "../../services/inventoryAnalyticsService.js";
import { parsePagination, ValidationError } from "../../utils/inventoryValidation.js";

export const getDashboard = async (req, res, next) => {
  try { res.json({ success: true, data: await buildInventoryDashboard() }); } catch (error) { next(error); }
};

export const getAlerts = async (req, res, next) => {
  try {
    const settings = await getInventorySettings();
    const now = new Date();
    const expiryEnd = new Date(now);
    expiryEnd.setUTCDate(expiryEnd.getUTCDate() + settings.expiryAlertDays);
    const [stock, expiry] = await Promise.all([
      InventoryItem.find({ isActive: true, $expr: { $lte: ["$currentStock", "$reorderLevel"] } }).populate("category supplier", "name code").sort({ currentStock: 1 }).lean(),
      InventoryItem.find({ isActive: true, tracksExpiry: true, expiryDate: { $ne: null, $lte: expiryEnd } }).populate("category supplier", "name code").sort({ expiryDate: 1 }).lean(),
    ]);
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
      const filter = { isActive: true };
      [data, total] = await Promise.all([
        InventoryItem.find(filter).populate("category supplier", "name code").sort({ name: 1 }).skip(skip).limit(limit).lean(),
        InventoryItem.countDocuments(filter),
      ]);
      data = data.map((item) => ({ ...item, inventoryValue: item.currentStock * item.unitCost }));
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
      const filter = { isActive: true, tracksExpiry: true, expiryDate: { $ne: null } };
      [data, total] = await Promise.all([InventoryItem.find(filter).populate("category supplier", "name code").sort({ expiryDate: 1 }).skip(skip).limit(limit).lean(), InventoryItem.countDocuments(filter)]);
    } else throw new ValidationError("Unknown inventory report type");
    res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) }, currency: "SAR" });
  } catch (error) { next(error); }
};

export const getSettings = async (req, res, next) => {
  try { res.json({ success: true, data: await getInventorySettings() }); } catch (error) { next(error); }
};

export const updateSettings = async (req, res, next) => {
  try {
    const payload = { updatedBy: req.user._id };
    if ("outletName" in req.body) payload.outletName = String(req.body.outletName || "").trim();
    if ("expiryAlertDays" in req.body) {
      const days = Number(req.body.expiryAlertDays);
      if (!Number.isInteger(days) || days < 1 || days > 365) throw new ValidationError("Expiry alert days must be between 1 and 365");
      payload.expiryAlertDays = days;
    }
    if ("defaultAllowNegativeStock" in req.body) payload.defaultAllowNegativeStock = Boolean(req.body.defaultAllowNegativeStock);
    const row = await InventorySettings.findOneAndUpdate({ key: "default" }, { $set: payload, $setOnInsert: { key: "default" } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
};
