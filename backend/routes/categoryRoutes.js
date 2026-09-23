import express from "express";
import {
  createCategory,
  deleteCategory,
  getManagedCategories,
  getPublicCategories,
  updateCategory,
} from "../controllers/categoryController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";

const router = express.Router();
const manage = [protect, requireCapability(CAPABILITIES.CATALOG_MANAGE)];

router.get("/", getPublicCategories);
router.get("/manage", ...manage, getManagedCategories);
router.post("/", ...manage, createCategory);
router.patch("/:id", ...manage, updateCategory);
router.delete("/:id", ...manage, deleteCategory);

export default router;
