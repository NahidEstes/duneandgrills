import express from "express";
import {
  createCombo,
  deleteCombo,
  getCombo,
  getCombos,
  getManagedCombos,
  updateCombo,
} from "../controllers/comboController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";

const router = express.Router();

router.get("/", getCombos);
router.get("/manage", protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), getManagedCombos);
router.post("/", protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), createCombo);
router.get("/:idOrSlug", getCombo);
router
  .route("/:id")
  .put(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), updateCombo)
  .patch(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), updateCombo)
  .delete(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), deleteCombo);

export default router;
