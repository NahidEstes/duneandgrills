import InventoryCategory from "../../models/InventoryCategory.js";
import InventoryItem from "../../models/InventoryItem.js";
import PurchaseOrder from "../../models/PurchaseOrder.js";
import Supplier from "../../models/Supplier.js";
import { escapeRegex, ValidationError } from "../../utils/inventoryValidation.js";

const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

export const listCategories = async (req, res, next) => {
  try {
    const match = req.query.includeInactive === "true" ? {} : { isActive: true };
    const rows = await InventoryCategory.aggregate([
      { $match: match },
      { $lookup: { from: InventoryItem.collection.name, localField: "_id", foreignField: "category", as: "items" } },
      { $addFields: { itemCount: { $size: "$items" }, inventoryValue: { $sum: { $map: { input: "$items", as: "item", in: { $multiply: ["$$item.currentStock", "$$item.unitCost"] } } } } } },
      { $project: { items: 0 } },
      { $sort: { name: 1 } },
    ]);
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

export const createCategory = async (req, res, next) => {
  try {
    const name = cleanText(req.body.name);
    if (!name) throw new ValidationError("Category name is required");
    const row = await InventoryCategory.create({ name, description: cleanText(req.body.description), color: cleanText(req.body.color) || "#f59e0b", isActive: req.body.isActive !== false });
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "This category already exists" });
    next(error);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const payload = {};
    if ("name" in req.body) {
      payload.name = cleanText(req.body.name);
      if (!payload.name) throw new ValidationError("Category name is required");
    }
    for (const field of ["description", "color"]) if (field in req.body) payload[field] = cleanText(req.body[field]);
    if ("isActive" in req.body) payload.isActive = Boolean(req.body.isActive);
    const row = await InventoryCategory.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!row) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const archiveCategory = async (req, res, next) => {
  try {
    const activeItems = await InventoryItem.countDocuments({ category: req.params.id, isActive: true });
    if (activeItems) throw new ValidationError("Move or archive active items in this category first");
    const row = await InventoryCategory.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!row) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, message: "Category archived" });
  } catch (error) { next(error); }
};

export const listSuppliers = async (req, res, next) => {
  try {
    const match = req.query.includeInactive === "true" ? {} : { isActive: true };
    if (req.query.search?.trim()) {
      const search = new RegExp(escapeRegex(req.query.search.trim()), "i");
      match.$or = [{ name: search }, { code: search }, { contactName: search }, { email: search }];
    }
    const rows = await Supplier.aggregate([
      { $match: match },
      { $lookup: { from: PurchaseOrder.collection.name, localField: "_id", foreignField: "supplier", as: "purchases" } },
      { $addFields: { purchaseCount: { $size: "$purchases" }, totalPurchases: { $sum: "$purchases.total" }, lastPurchaseAt: { $max: "$purchases.createdAt" } } },
      { $project: { purchases: 0 } },
      { $sort: { name: 1 } },
    ]);
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

const supplierPayload = (body, partial = false) => {
  const result = {};
  for (const field of ["code", "name"]) {
    if (!partial || field in body) {
      const value = cleanText(body[field]);
      if (!value) throw new ValidationError(`${field} is required`);
      result[field] = field === "code" ? value.toUpperCase() : value;
    }
  }
  for (const field of ["contactName", "email", "phone", "address", "taxNumber", "paymentTerms", "notes", "externalId"]) {
    if (field in body) result[field] = cleanText(body[field]);
  }
  if ("isActive" in body) result.isActive = Boolean(body.isActive);
  return result;
};

export const createSupplier = async (req, res, next) => {
  try {
    const row = await Supplier.create(supplierPayload(req.body));
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "This supplier code already exists" });
    next(error);
  }
};

export const updateSupplier = async (req, res, next) => {
  try {
    const row = await Supplier.findByIdAndUpdate(req.params.id, supplierPayload(req.body, true), { new: true, runValidators: true });
    if (!row) return res.status(404).json({ success: false, message: "Supplier not found" });
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const archiveSupplier = async (req, res, next) => {
  try {
    const row = await Supplier.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!row) return res.status(404).json({ success: false, message: "Supplier not found" });
    res.json({ success: true, message: "Supplier archived. Purchase history was preserved." });
  } catch (error) { next(error); }
};

export const supplierPurchases = async (req, res, next) => {
  try {
    const rows = await PurchaseOrder.find({ supplier: req.params.id }).sort({ createdAt: -1 }).populate("items.item", "name sku unit").lean();
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};
