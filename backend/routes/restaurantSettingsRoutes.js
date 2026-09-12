import express from "express";
import {
  getAdminRestaurantSettings,
  getPublicRestaurantSettings,
  saveRestaurantSettings,
} from "../controllers/restaurantSettingsController.js";
import { authorize, protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/public", getPublicRestaurantSettings);
router.get("/", protect, authorize("admin", "manager"), getAdminRestaurantSettings);
router.put("/", protect, authorize("admin", "manager"), saveRestaurantSettings);

export default router;
