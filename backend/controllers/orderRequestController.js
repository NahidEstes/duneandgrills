import { resolveOrderInput } from "../config/orderContract.js";
import { cancelCreationRequest, creationIdentity, trackingTokenForIdentity } from "../services/orderEngineService.js";
import { serializeCustomerOrder } from "../services/orderSerializer.js";

export const cancelOrderRequest = channel => async (req, res, next) => {
  try {
    const input = resolveOrderInput(req.body, channel);
    const identity = creationIdentity({ payload: req.body, key: req.body.idempotencyKey, channel, actor: req.user, orderType: input.orderType });
    const result = await cancelCreationRequest({ identity, actor: req.user, correlationId: req.correlationId });
    const posOrder = result.order?.toJSON();
    if (posOrder) { delete posOrder.creationRequestHash; delete posOrder.trackingTokenHash; }
    res.json({ success: true, cancelled: result.cancelled, ...(result.order ? {
      data: channel === "customer" ? serializeCustomerOrder(result.order) : posOrder,
      ...(channel === "customer" ? { trackingToken: trackingTokenForIdentity(identity) } : {}),
    } : {}) });
  } catch (error) { next(error); }
};
