import Order from "../models/Order.js";
import Refund from "../models/Refund.js";
import { createRefundRequest, refundSummaryForOrder, transitionRefund } from "../services/refundService.js";
import { parsePagination } from "../utils/inventoryValidation.js";

const populate = (query) => query.populate("requestedBy approvedBy processedBy", "name role").populate("order", "orderNumber totalAmount paymentMethod paymentStatus refundedAmount");

export const listOrderRefunds = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true, data: await refundSummaryForOrder(order) });
  } catch (error) { next(error); }
};

export const listRefunds = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 25);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.order) filter.order = req.query.order;
    const [rows, total] = await Promise.all([populate(Refund.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)).lean(), Refund.countDocuments(filter)]);
    res.json({ success: true, data: rows.map((row) => ({ ...row, amount: Number((row.amountHalala / 100).toFixed(2)), currency: "SAR" })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

export const requestRefund = async (req, res, next) => {
  try {
    const result = await createRefundRequest({ orderId: req.params.id, payload: req.body, actor: req.user, correlationId: req.correlationId });
    await result.refund.populate("requestedBy approvedBy processedBy", "name role");
    res.status(result.duplicate ? 200 : 201).json({ success: true, duplicate: result.duplicate, data: { ...result.refund.toObject(), amount: Number((result.refund.amountHalala / 100).toFixed(2)), currency: "SAR" } });
  } catch (error) { next(error); }
};

export const changeRefundStatus = (action) => async (req, res, next) => {
  try {
    const result = await transitionRefund({ refundId: req.params.refundId, action, payload: req.body, actor: req.user, correlationId: req.correlationId });
    await result.refund.populate("requestedBy approvedBy processedBy", "name role");
    res.json({ success: true, duplicate: result.duplicate, data: { ...result.refund.toObject(), amount: Number((result.refund.amountHalala / 100).toFixed(2)), currency: "SAR" } });
  } catch (error) { next(error); }
};
