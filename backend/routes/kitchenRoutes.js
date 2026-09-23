import express from "express";
import { getKitchenQueue, updateKitchenOrderStatus } from "../controllers/kitchenController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";

const router = express.Router();

router.use(protect, requireCapability(CAPABILITIES.KITCHEN_OPERATE));
router.get("/orders", getKitchenQueue);
router.patch("/orders/:id/status", updateKitchenOrderStatus);

export default router;
