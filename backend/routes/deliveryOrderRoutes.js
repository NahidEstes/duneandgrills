import express from "express";
import { checkDeliveryOrderId, createDeliveryOrder, getDeliveryEntryConfig } from "../controllers/deliveryOrderController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";

const router = express.Router();
router.use(protect, requireCapability(CAPABILITIES.POS_OPERATE));
router.get("/config", getDeliveryEntryConfig);
router.get("/duplicate-check", checkDeliveryOrderId);
router.post("/orders", createDeliveryOrder);

export default router;
