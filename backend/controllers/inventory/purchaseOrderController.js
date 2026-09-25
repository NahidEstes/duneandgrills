import PurchaseOrder from "../../models/PurchaseOrder.js";
import { createPurchaseOrder, receivePurchaseOrder, transitionPurchaseOrder, updatePurchaseOrder } from "../../services/purchaseOrderService.js";
import { parsePagination, validatePurchaseOrderPayload } from "../../utils/inventoryValidation.js";
import { pickAuditFields, recordAuditLog } from "../../services/auditLogService.js";
import { getEffectiveRestaurantSettings } from "../../services/restaurantSettingsService.js";

const AUDIT_FIELDS = ["supplier", "items", "status", "subtotal", "tax", "discount", "additionalCharges", "total", "notes", "revision", "priceWarnings", "orderedAt", "expectedAt", "receivedAt"];

const populate = [
  { path: "supplier", select: "name code contactName email phone" },
  { path: "items.item", select: "name sku unit purchaseUnit purchaseConversionFactor currentStock tracksExpiry" },
  { path: "createdBy", select: "name email" },
  { path: "updatedBy", select: "name email" },
];

export const listPurchaseOrders = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 20);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.supplier) filter.supplier = req.query.supplier;
    const [rows, total] = await Promise.all([
      PurchaseOrder.find(filter).populate(populate).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PurchaseOrder.countDocuments(filter),
    ]);
    res.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

export const getPurchaseOrder = async (req, res, next) => {
  try {
    const row = await PurchaseOrder.findById(req.params.id).populate(populate).lean();
    if (!row) return res.status(404).json({ success: false, message: "Purchase order not found" });
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const createPurchaseOrderController = async (req, res, next) => {
  try {
    const payload = validatePurchaseOrderPayload(req.body);
    const settings = await getEffectiveRestaurantSettings();
    const row = await createPurchaseOrder(payload, req.user, settings.procurement);
    await recordAuditLog({ actor: req.user, action: "PURCHASE_ORDER_CREATED", entityType: "PurchaseOrder", entityId: row._id, entityLabel: row.orderNumber, correlationId: req.correlationId, after: pickAuditFields(row, AUDIT_FIELDS) });
    await row.populate(populate);
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const updatePurchaseOrderController = async (req, res, next) => {
  try {
    const row = await PurchaseOrder.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Purchase order not found" });
    const payload = validatePurchaseOrderPayload(req.body, { partial: true });
    const before = pickAuditFields(row, AUDIT_FIELDS);
    const settings = await getEffectiveRestaurantSettings();
    const updated = await updatePurchaseOrder(row, payload, req.user, settings.procurement);
    await recordAuditLog({ actor: req.user, action: "PURCHASE_ORDER_UPDATED", entityType: "PurchaseOrder", entityId: updated._id, entityLabel: updated.orderNumber, correlationId: req.correlationId, before, after: pickAuditFields(updated, AUDIT_FIELDS), reason: String(req.body.reason || "").trim() });
    await updated.populate(populate);
    res.json({ success: true, data: updated });
  } catch (error) { next(error); }
};

export const changePurchaseOrderStatus = async (req, res, next) => {
  try {
    const settings = await getEffectiveRestaurantSettings();
    const result = await transitionPurchaseOrder({ id: req.params.id, target: req.body.status, actor: req.user, settings: settings.procurement, reason: req.body.reason, externalReference: req.body.externalReference, idempotencyKey: req.body.idempotencyKey, emergencyOverride: Boolean(req.body.emergencyOverride) });
    await result.po.populate(populate);
    res.json({ success: true, data: result.po, duplicate: result.duplicate });
  } catch (error) { next(error); }
};

export const receivePurchaseOrderController = async (req, res, next) => {
  try {
    const settings = await getEffectiveRestaurantSettings();
    const result = await receivePurchaseOrder(req.params.id, req.body.items, req.user, req.body.notes, settings.procurement, req.body.idempotencyKey);
    await result.order.populate(populate);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};
