import express from "express";
import {
  getMenuItems,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "../controllers/menuController.js";

const router = express.Router();

router.route("/").get(getMenuItems).post(createMenuItem);
router.route("/:id").get(getMenuItemById).put(updateMenuItem).delete(deleteMenuItem);

export default router;
