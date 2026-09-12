import {
  getEffectiveRestaurantSettings,
  loadAdminRestaurantSettings,
  toPublicRestaurantSettings,
  updateRestaurantSettings,
} from "../services/restaurantSettingsService.js";

export const getPublicRestaurantSettings = async (_req, res, next) => {
  try {
    const settings = await getEffectiveRestaurantSettings();
    res.json({ success: true, data: toPublicRestaurantSettings(settings) });
  } catch (error) {
    next(error);
  }
};

export const getAdminRestaurantSettings = async (_req, res, next) => {
  try {
    res.json({ success: true, data: await loadAdminRestaurantSettings() });
  } catch (error) {
    next(error);
  }
};

export const saveRestaurantSettings = async (req, res, next) => {
  try {
    const settings = await updateRestaurantSettings(req.body, req.user);
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};
