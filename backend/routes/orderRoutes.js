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
} from "../controllers/orderController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

router
  .route("/")
  .get(protect, authorize("admin", "manager"), getOrders)
  .post(protect, createOrder);
router.get("/config", getOrderConfig);
router.get("/my", protect, getMyOrders);
router.get("/stats", protect, authorize("admin", "manager"), getOrderStats);
router.patch("/bulk-status", protect, authorize("admin", "manager"), bulkUpdateOrderStatus);
router.route("/:id").get(getOrderById);
router.patch(
  "/:id/status",
  protect,
  authorize("admin", "manager"),
  updateOrderStatus
);

export default router;
