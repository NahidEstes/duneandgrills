import express from "express";
import {
  createCategory,
  deleteCategory,
  getManagedCategories,
  getPublicCategories,
  updateCategory,
} from "../controllers/categoryController.js";
import { authorize, protect } from "../middleware/auth.js";

const router = express.Router();
const manage = [protect, authorize("admin", "manager")];

router.get("/", getPublicCategories);
router.get("/manage", ...manage, getManagedCategories);
router.post("/", ...manage, createCategory);
router.patch("/:id", ...manage, updateCategory);
router.delete("/:id", ...manage, deleteCategory);

export default router;
