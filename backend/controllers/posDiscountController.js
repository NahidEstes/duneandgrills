import { calculateCartSubtotal, resolveCartLines } from "../services/catalogService.js";
import { getEffectiveRestaurantSettings } from "../services/restaurantSettingsService.js";
import { approvePosDiscount, resolvePosDiscount } from "../services/posDiscountService.js";
import { recordAuditLog } from "../services/auditLogService.js";

export const requestPosDiscountApproval = async (req, res, next) => {
  try {
    const catalogLines = await resolveCartLines(req.body.items);
    const subtotal = calculateCartSubtotal(catalogLines);
    const settings = await getEffectiveRestaurantSettings();
    const discount = resolvePosDiscount({ subtotal, discount: req.body.discount, settings: settings.posCheckout, role: req.user.role });
    if (!discount.amount) return res.status(400).json({ success: false, message: "Enter a discount before requesting approval" });
    const approval = await approvePosDiscount({ cashier: req.user, pin: req.body.managerPin, items: req.body.items, discount, correlationId: req.correlationId });
    res.status(201).json({ success: true, data: { ...approval, discountAmount: discount.amount } });
  } catch (error) {
    if ([401, 403].includes(error?.status)) {
      await recordAuditLog({ actor: req.user, action: "POS_DISCOUNT_APPROVAL_REJECTED", entityType: "PosDiscountApproval", entityLabel: "Rejected POS discount approval", reason: error.message, metadata: { correlationId: req.correlationId } }).catch(() => {});
    }
    next(error);
  }
};
