import Order from "../models/Order.js";
import { voidPosSale } from "../services/posVoidService.js";
import { refundSummaryForOrder, createRefundRequest } from "../services/refundService.js";
import { hasCapability, CAPABILITIES } from "../config/permissions.js";
import { recordAuditLog } from "../services/auditLogService.js";
import { assertObjectId, ValidationError } from "../utils/inventoryValidation.js";
import { resolveCartLines } from "../services/catalogService.js";

const accessibleSale = async (req) => {
  const filter = { _id: assertObjectId(req.params.id), source: "pos" };
  if (!hasCapability(req.user.role, CAPABILITIES.POS_HISTORY_VIEW_ALL)) filter.createdBy = req.user._id;
  const order = await Order.findOne(filter).populate("createdBy", "name role");
  if (!order) throw Object.assign(new ValidationError("POS sale was not found"), { status: 404 });
  return order;
};
export const getPosSale = async (req, res, next) => { try {
  const order = await accessibleSale(req);
  const sale = order.toObject();
  sale.customer = { name: sale.customer?.name || "Walk-in Customer" };
  res.json({ success: true, data: sale, refunds: await refundSummaryForOrder(order) });
} catch (e) { next(e); } };
export const reprintPosSale = async (req, res, next) => { try {
  const order = await accessibleSale(req);
  await recordAuditLog({ actor: req.user, action: "POS_RECEIPT_REPRINTED", entityType: "Order", entityId: order._id, entityLabel: order.orderNumber });
  const sale = order.toObject(); sale.customer = { name: sale.customer?.name || "Walk-in Customer" };
  res.json({ success: true, data: { ...sale, isReprint: true } });
} catch (e) { next(e); } };
export const voidSale = async (req, res, next) => { try { res.json({ success: true, ...(await voidPosSale({ orderId: assertObjectId(req.params.id), payload: req.body, actor: req.user, correlationId: req.correlationId })) }); } catch (e) { next(e); } };
export const requestPosRefund = async (req, res, next) => { try {
  await accessibleSale(req);
  res.status(201).json({ success: true, ...(await createRefundRequest({ orderId: req.params.id, payload: req.body, actor: req.user, correlationId: req.correlationId })) });
} catch (e) { next(e); } };
export const repeatPosSale = async (req, res, next) => { try {
  const order = await accessibleSale(req); const lines = []; const warnings = [];
  for (const item of order.items) {
    try {
      const [resolved] = await resolveCartLines([{ productId: item.productType === "combo" ? item.combo : item.menuItem, productType: item.productType, quantity: item.quantity, customization: { selectedAddOns: item.selectedAddOns, spiceLevel: item.spiceLevel, note: item.itemNote } }]);
      lines.push({ productId: resolved.product._id, productType: resolved.productType, name: resolved.product.name, image: resolved.product.image, price: resolved.unitPrice, quantity: resolved.quantity, customization: resolved.customization });
    } catch (failure) { warnings.push(`${item.name}: ${failure.message}`); }
  }
  res.json({ success: true, data: lines, warnings });
} catch (e) { next(e); } };
