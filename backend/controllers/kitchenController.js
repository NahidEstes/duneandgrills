import {
  KITCHEN_DEFAULT_PREPARATION_MINUTES,
  KITCHEN_READY_RETENTION_MINUTES,
  listKitchenOrders,
  transitionKitchenOrder,
} from "../services/kitchenService.js";

export const getKitchenQueue = async (req, res, next) => {
  try {
    const now = new Date();
    const orders = await listKitchenOrders(req.query, now);
    res.json({
      success: true,
      data: orders,
      serverNow: now,
      config: {
        defaultPreparationMinutes: KITCHEN_DEFAULT_PREPARATION_MINUTES,
        readyRetentionMinutes: KITCHEN_READY_RETENTION_MINUTES,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateKitchenOrderStatus = async (req, res, next) => {
  try {
    const order = await transitionKitchenOrder({
      orderId: req.params.id,
      nextStatus: req.body.status,
      estimatedPreparationMinutes: req.body.estimatedPreparationMinutes,
      actor: req.user,
    });
    res.json({ success: true, data: order, serverNow: new Date() });
  } catch (error) {
    next(error);
  }
};
