import ReorderSuggestion from "../../models/ReorderSuggestion.js";
import Supplier from "../../models/Supplier.js";
import { getEffectiveRestaurantSettings } from "../../services/restaurantSettingsService.js";
import { generateDraftPurchaseOrders, recalculateAllSuggestions, recalculateItemSuggestion, resolveSuggestionPrice } from "../../services/reorderService.js";
import { recordAuditLog } from "../../services/auditLogService.js";
import { escapeRegex, parsePagination, ValidationError } from "../../utils/inventoryValidation.js";

const populate = [{ path: "item", select: "name sku unit purchaseUnit minimumOrderQuantity orderMultiple category", populate: { path: "category", select: "name" } }, { path: "supplier", select: "name code isActive" }, { path: "reviewedSupplier", select: "name code isActive" }, { path: "convertedPurchaseOrder", select: "orderNumber status" }];

export const listReorderSuggestions = async (req, res, next) => {
  try {
    await ReorderSuggestion.updateMany({ status: { $in: ["open", "reviewed"] }, staleAt: { $lte: new Date() } }, { $set: { status: "stale" } });
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    for (const field of ["status", "severity", "supplier", "category"]) if (req.query[field]) filter[field] = req.query[field];
    if (req.query.search?.trim()) {
      const itemIds = await (await import("../../models/InventoryItem.js")).default.find({ $or: [{ name: new RegExp(escapeRegex(req.query.search.trim()), "i") }, { sku: new RegExp(escapeRegex(req.query.search.trim()), "i") }] }).distinct("_id");
      filter.item = { $in: itemIds };
    }
    const allowed = new Set(["calculatedAt", "severity", "suggestedQuantity", "estimatedTotal", "status"]); const sortBy = allowed.has(req.query.sortBy) ? req.query.sortBy : "calculatedAt"; const order = req.query.sortOrder === "asc" ? 1 : -1;
    const [rows, total, summary] = await Promise.all([ReorderSuggestion.find(filter).populate(populate).sort({ [sortBy]: order }).skip(skip).limit(limit).lean(), ReorderSuggestion.countDocuments(filter), ReorderSuggestion.aggregate([{ $match: filter }, { $group: { _id: null, critical: { $sum: { $cond: [{ $eq: ["$severity", "critical"] }, 1, 0] } }, required: { $sum: { $cond: [{ $in: ["$status", ["open", "reviewed"]] }, 1, 0] } }, value: { $sum: { $ifNull: ["$estimatedTotal", 0] } }, missing: { $sum: { $cond: [{ $gt: [{ $size: { $setIntersection: ["$warnings", ["MISSING_PREFERRED_SUPPLIER", "MISSING_PURCHASE_PRICE", "MISSING_LEAD_TIME"]] } }, 0] }, 1, 0] } }, stale: { $sum: { $cond: [{ $eq: ["$status", "stale"] }, 1, 0] } } } }])]);
    res.json({ success: true, data: rows, summary: summary[0] || { critical: 0, required: 0, value: 0, missing: 0, stale: 0 }, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

export const recalculateSuggestions = async (req, res, next) => { try { const data = req.body.item ? { suggestion: await recalculateItemSuggestion(req.body.item) } : await recalculateAllSuggestions({ actor: req.user }); if (req.body.item) await recordAuditLog({ actor: req.user, action: "REORDER_SUGGESTION_RECALCULATED", entityType: "InventoryItem", entityId: req.body.item, reason: "Manual focused recalculation" }); res.json({ success: true, data }); } catch (error) { next(error); } };

export const reviewSuggestion = async (req, res, next) => {
  try {
    const row = await ReorderSuggestion.findById(req.params.id).populate("item"); if (!row) return res.status(404).json({ success: false, message: "Suggestion not found" });
    const quantity = Number(req.body.quantity ?? row.suggestedQuantity); const supplier = req.body.supplier || row.supplier;
    if (!(quantity > 0)) throw new ValidationError("Reviewed quantity must be greater than zero");
    const minimum = Number(row.item.minimumOrderQuantity || 1); const multiple = Number(row.item.orderMultiple || 1);
    if (quantity < minimum || Math.abs(quantity / multiple - Math.round(quantity / multiple)) > 1e-6) throw new ValidationError(`Quantity must respect MOQ ${minimum} and order multiple ${multiple}`);
    const supplierRow = supplier ? await Supplier.findOne({ _id: supplier, isActive: true }) : null; if (!supplierRow) throw new ValidationError("An active supplier is required");
    const enteredPrice = req.body.unitPrice === "" || req.body.unitPrice == null ? null : Number(req.body.unitPrice); if (enteredPrice != null && !(enteredPrice > 0)) throw new ValidationError("Manual unit price must be greater than zero");
    const changed = quantity !== Number(row.suggestedQuantity) || String(supplier) !== String(row.supplier) || enteredPrice != null; const reason = String(req.body.reason || "").trim(); if (changed && !reason) throw new ValidationError("Override reason is required");
    const before = { status: row.status, quantity: row.reviewedQuantity, supplier: row.reviewedSupplier, unitPrice: row.reviewedUnitPrice }; const resolvedPrice = enteredPrice == null ? await resolveSuggestionPrice(row.item._id, supplier) : { unitPrice: enteredPrice, source: "manual", reference: null }; row.status = "reviewed"; row.reviewedQuantity = quantity; row.reviewedUnitPrice = enteredPrice; row.reviewedSupplier = supplier; row.reviewedBy = req.user._id; row.reviewedAt = new Date(); row.overrideReason = reason; row.suggestedUnitPrice = resolvedPrice.unitPrice; row.priceSource = resolvedPrice.source; row.priceSourceReference = resolvedPrice.reference; row.estimatedTotal = resolvedPrice.unitPrice ? Number((resolvedPrice.unitPrice * quantity).toFixed(2)) : null; row.warnings = row.warnings.filter((warning) => warning !== "MISSING_PREFERRED_SUPPLIER" && warning !== "MISSING_PURCHASE_PRICE"); if (!resolvedPrice.unitPrice) row.warnings.push("MISSING_PURCHASE_PRICE"); await row.save();
    await recordAuditLog({ actor: req.user, action: changed ? "REORDER_SUGGESTION_OVERRIDDEN" : "REORDER_SUGGESTION_REVIEWED", entityType: "ReorderSuggestion", entityId: row._id, entityLabel: row.item.sku, reason, before, after: { status: row.status, quantity, supplier, unitPrice: resolvedPrice.unitPrice, priceSource: resolvedPrice.source } });
    await row.populate(populate); res.json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const dismissSuggestion = async (req, res, next) => {
  try { const reason = String(req.body.reason || "").trim(); if (!reason) throw new ValidationError("Dismissal reason is required"); const row = await ReorderSuggestion.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: "Suggestion not found" }); const days = Math.max(1, Math.min(365, Number(req.body.days) || 7)); row.status = "dismissed"; row.dismissedBy = req.user._id; row.dismissedAt = new Date(); row.dismissReason = reason; row.snoozedUntil = new Date(Date.now() + days * 86400000); await row.save(); await recordAuditLog({ actor: req.user, action: "REORDER_SUGGESTION_DISMISSED", entityType: "ReorderSuggestion", entityId: row._id, reason, after: { snoozedUntil: row.snoozedUntil } }); res.json({ success: true, data: row }); } catch (error) { next(error); }
};

export const generateDrafts = async (req, res, next) => { try { const settings = await getEffectiveRestaurantSettings(); const data = await generateDraftPurchaseOrders({ suggestionIds: req.body.suggestionIds, overrides: req.body.overrides, idempotencyKey: req.body.idempotencyKey, actor: req.user, purchaseSettings: settings.procurement }); res.status(data.duplicate ? 200 : 201).json({ success: true, data }); } catch (error) { next(error); } };
