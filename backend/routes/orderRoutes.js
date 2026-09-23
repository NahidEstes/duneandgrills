import express from "express";
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  getMyOrders,
  getOrderStats,
  getOrderConfig,
  bulkUpdateOrderStatus,
  trackGuestOrder,
} from "../controllers/orderController.js";
import { optionalAuth, protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";
import { rateLimit } from "../middleware/security.js";

const router = express.Router();

router
  .route("/")
  .get(protect, requireCapability(CAPABILITIES.ORDERS_READ_ALL), getOrders)
  .post(optionalAuth, createOrder);
router.get("/config", getOrderConfig);
router.get("/my", protect, getMyOrders);
router.get("/stats", protect, requireCapability(CAPABILITIES.ORDERS_READ_ALL), getOrderStats);
router.patch("/bulk-status", protect, requireCapability(CAPABILITIES.ORDERS_MANAGE), bulkUpdateOrderStatus);
router.get("/track/:orderNumber", rateLimit({ windowMs: 15 * 60_000, max: 30, keyPrefix: "order-track" }), trackGuestOrder);
router.route("/:id").get(protect, getOrderById);
router.patch(
  "/:id/status",
  protect,
  requireCapability(CAPABILITIES.ORDERS_MANAGE),
  updateOrderStatus
);

export default router;
