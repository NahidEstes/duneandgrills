import express from "express";
import {
  addToCart,
  clearCart,
  getCart,
  migrateCart,
  removeItem,
  updateItem,
} from "../controllers/cartController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);
router.post("/migrate", migrateCart);
router.route("/").get(getCart).post(addToCart).delete(clearCart);
router.route("/:productId").patch(updateItem).delete(removeItem);

export default router;
