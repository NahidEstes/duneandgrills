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
import { changeRefundStatus, listOrderRefunds, listRefunds, requestRefund } from "../controllers/refundController.js";

const router = express.Router();

router
  .route("/")
  .get(protect, requireCapability(CAPABILITIES.ORDERS_READ_ALL), getOrders)
  .post(optionalAuth, createOrder);
router.get("/config", getOrderConfig);
router.get("/my", protect, getMyOrders);
router.get("/stats", protect, requireCapability(CAPABILITIES.ORDERS_READ_ALL), getOrderStats);
router.get("/refunds", protect, requireCapability(CAPABILITIES.REFUNDS_READ), listRefunds);
router.patch("/bulk-status", protect, requireCapability(CAPABILITIES.ORDERS_MANAGE), bulkUpdateOrderStatus);
router.get("/track/:orderNumber", rateLimit({ windowMs: 15 * 60_000, max: 30, keyPrefix: "order-track" }), trackGuestOrder);
router.get("/:id/refunds", protect, requireCapability(CAPABILITIES.REFUNDS_READ), listOrderRefunds);
router.post("/:id/refunds", protect, requireCapability(CAPABILITIES.REFUNDS_REQUEST), requestRefund);
router.post("/refunds/:refundId/approve", protect, requireCapability(CAPABILITIES.REFUNDS_APPROVE), changeRefundStatus("approve"));
router.post("/refunds/:refundId/reject", protect, requireCapability(CAPABILITIES.REFUNDS_APPROVE), changeRefundStatus("reject"));
router.post("/refunds/:refundId/process", protect, requireCapability(CAPABILITIES.REFUNDS_PROCESS), changeRefundStatus("process"));
router.post("/refunds/:refundId/complete", protect, requireCapability(CAPABILITIES.REFUNDS_PROCESS), changeRefundStatus("complete"));
router.post("/refunds/:refundId/fail", protect, requireCapability(CAPABILITIES.REFUNDS_PROCESS), changeRefundStatus("fail"));
router.post("/refunds/:refundId/cancel", protect, requireCapability(CAPABILITIES.REFUNDS_APPROVE), changeRefundStatus("cancel"));
router.route("/:id").get(protect, getOrderById);
router.patch(
  "/:id/status",
  protect,
  requireCapability(CAPABILITIES.ORDERS_MANAGE),
  updateOrderStatus
);

export default router;
