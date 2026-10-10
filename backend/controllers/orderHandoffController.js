import { resolveFulfillmentStatus } from "../config/orderContract.js";
import { transitionOrder } from "../services/orderEngineService.js";
import { recordOrderPayment } from "../services/orderPaymentService.js";
import { serializeKitchenOrder } from "../services/kitchenService.js";

export const handoffOrder = async (req, res, next) => {
  try {
    const result = await transitionOrder({ orderId: req.params.id, nextStatus: resolveFulfillmentStatus(req.body), expectedStatus: req.body.expectedStatus, actor: req.user, workflow: "handoff", correlationId: req.correlationId });
    res.json({ success: true, data: req.user.role === "kitchen" ? serializeKitchenOrder(result.order) : result.order, duplicate: result.duplicate, serverNow: new Date() });
  } catch (error) { next(error); }
};
export const collectOrderPayment = async (req, res, next) => {
  try { res.json({ success: true, ...await recordOrderPayment({ orderId: req.params.id, actor: req.user, payload: req.body, correlationId: req.correlationId }) }); }
  catch (error) { next(error); }
};
