import PurchaseOrder from "../../models/PurchaseOrder.js";
import { createPurchaseOrder, receivePurchaseOrder, updatePurchaseOrder } from "../../services/purchaseOrderService.js";
import { parsePagination, validatePurchaseOrderPayload, ValidationError } from "../../utils/inventoryValidation.js";

const populate = [
  { path: "supplier", select: "name code contactName email phone" },
  { path: "items.item", select: "name sku unit currentStock" },
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
    const row = await createPurchaseOrder(payload, req.user._id);
    await row.populate(populate);
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const updatePurchaseOrderController = async (req, res, next) => {
  try {
    const row = await PurchaseOrder.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Purchase order not found" });
    const payload = validatePurchaseOrderPayload(req.body, { partial: true });
    const updated = await updatePurchaseOrder(row, payload, req.user._id);
    await updated.populate(populate);
    res.json({ success: true, data: updated });
  } catch (error) { next(error); }
};

export const changePurchaseOrderStatus = async (req, res, next) => {
  try {
    const row = await PurchaseOrder.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Purchase order not found" });
    const allowed = { draft: ["ordered", "cancelled"], ordered: ["cancelled"], partially_received: ["cancelled"] };
    if (!allowed[row.status]?.includes(req.body.status)) throw new ValidationError(`Cannot change ${row.status} purchase order to ${req.body.status}`);
    row.status = req.body.status;
    if (row.status === "ordered" && !row.orderedAt) row.orderedAt = new Date();
    row.updatedBy = req.user._id;
    await row.save();
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const receivePurchaseOrderController = async (req, res, next) => {
  try {
    const result = await receivePurchaseOrder(req.params.id, req.body.items, req.user._id, req.body.notes);
    await result.order.populate(populate);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};
