import { DELIVERY_PROVIDERS } from "../config/sales.js";
import Order from "../models/Order.js";
import { getEffectiveRestaurantSettings } from "../services/restaurantSettingsService.js";
import { createHistoricalDeliveryOrder, findDeliveryOrderDuplicate } from "../services/deliveryOrderService.js";

const populateOrder = (query) => query
  .populate("createdBy", "name role")
  .populate("items.menuItem", "name image")
  .populate("items.combo", "name image");

export const getDeliveryEntryConfig = async (_req, res, next) => {
  try {
    const settings = await getEffectiveRestaurantSettings();
    const location = settings.location || {};
    const branch = [location.city, location.address].filter(Boolean).join(" — ") || "Dune & Grills — Main Branch";
    res.json({
      success: true,
      data: {
        providers: DELIVERY_PROVIDERS.map((value) => ({ value, enabled: settings.orders.channels[value] !== false })),
        defaultBranch: branch,
        currency: "SAR",
        paymentType: "aggregator_prepaid",
      },
    });
  } catch (error) { next(error); }
};

export const checkDeliveryOrderId = async (req, res, next) => {
  try {
    if (!DELIVERY_PROVIDERS.includes(String(req.query.provider || "").toLowerCase())) return res.status(400).json({ success: false, message: "Choose a supported delivery platform" });
    const existing = await findDeliveryOrderDuplicate(req.query);
    res.json({ success: true, duplicate: Boolean(existing), existingOrder: existing || null });
  } catch (error) { next(error); }
};

export const createDeliveryOrder = async (req, res, next) => {
  try {
    const settings = await getEffectiveRestaurantSettings();
    const order = await createHistoricalDeliveryOrder({ payload: { ...req.body, correlationId: req.correlationId }, actor: req.user, restaurantSettings: settings });
    const populated = await populateOrder(Order.findById(order._id));
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.existingOrder) return res.status(409).json({ success: false, message: error.message, existingOrder: error.existingOrder, fields: error.fields });
    next(error);
  }
};
