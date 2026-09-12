import {
  KITCHEN_READY_RETENTION_MINUTES,
  listKitchenOrders,
  transitionKitchenOrder,
} from "../services/kitchenService.js";
import { getEffectiveRestaurantSettings } from "../services/restaurantSettingsService.js";

export const getKitchenQueue = async (req, res, next) => {
  try {
    const now = new Date();
    const settings = await getEffectiveRestaurantSettings();
    const orders = await listKitchenOrders(req.query, now, {
      readyRetentionMinutes: KITCHEN_READY_RETENTION_MINUTES,
    });
    res.json({
      success: true,
      data: orders,
      serverNow: now,
      config: {
        defaultPreparationMinutes: settings.preparation.defaultMinutes,
        readyRetentionMinutes: KITCHEN_READY_RETENTION_MINUTES,
        notifications: {
          soundEnabled: settings.notifications.kitchenSoundEnabled,
          alertRepeatIntervalSeconds: settings.notifications.alertRepeatIntervalSeconds,
          maximumAlertRepeats: settings.notifications.maximumAlertRepeats,
          pollingIntervalSeconds: settings.notifications.pollingIntervalSeconds,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateKitchenOrderStatus = async (req, res, next) => {
  try {
    const settings = await getEffectiveRestaurantSettings();
    const order = await transitionKitchenOrder({
      orderId: req.params.id,
      nextStatus: req.body.status,
      estimatedPreparationMinutes: req.body.estimatedPreparationMinutes,
      actor: req.user,
      defaultPreparationMinutes: settings.preparation.defaultMinutes,
    });
    res.json({ success: true, data: order, serverNow: new Date() });
  } catch (error) {
    next(error);
  }
};
