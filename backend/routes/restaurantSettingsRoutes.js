import express from "express";
import {
  getAdminRestaurantSettings,
  getPublicRestaurantSettings,
  saveRestaurantSettings,
} from "../controllers/restaurantSettingsController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";
import { setRiderDeliverySetting } from "../services/riderAccessService.js";

const router = express.Router();
router.patch("/rider-delivery", protect, requireCapability(CAPABILITIES.SETTINGS_MANAGE), async (req, res, next) => {
  try { res.set("Cache-Control", "private, no-store").json({ success: true, data: await setRiderDeliverySetting(req.user, req.body) }); }
  catch (error) { next(error); }
});

router.get("/public", getPublicRestaurantSettings);
router.get("/", protect, requireCapability(CAPABILITIES.SETTINGS_MANAGE), getAdminRestaurantSettings);
router.put("/", protect, requireCapability(CAPABILITIES.SETTINGS_MANAGE), saveRestaurantSettings);

export default router;
