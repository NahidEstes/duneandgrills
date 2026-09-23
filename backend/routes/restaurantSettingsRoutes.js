import express from "express";
import {
  getAdminRestaurantSettings,
  getPublicRestaurantSettings,
  saveRestaurantSettings,
} from "../controllers/restaurantSettingsController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";

const router = express.Router();

router.get("/public", getPublicRestaurantSettings);
router.get("/", protect, requireCapability(CAPABILITIES.SETTINGS_MANAGE), getAdminRestaurantSettings);
router.put("/", protect, requireCapability(CAPABILITIES.SETTINGS_MANAGE), saveRestaurantSettings);

export default router;
