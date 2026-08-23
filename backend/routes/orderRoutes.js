import express from "express";
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  getMyOrders,
} from "../controllers/orderController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

router
  .route("/")
  .get(protect, authorize("admin", "manager"), getOrders)
  .post(protect, createOrder);
router.get("/my", protect, getMyOrders);
router.route("/:id").get(getOrderById);
router.patch(
  "/:id/status",
  protect,
  authorize("admin", "manager"),
  updateOrderStatus
);

export default router;
