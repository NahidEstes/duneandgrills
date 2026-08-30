import express from "express";
import {
  createCombo,
  deleteCombo,
  getCombo,
  getCombos,
  getManagedCombos,
  updateCombo,
} from "../controllers/comboController.js";
import { authorize, protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/", getCombos);
router.get("/manage", protect, authorize("admin", "manager"), getManagedCombos);
router.post("/", protect, authorize("admin", "manager"), createCombo);
router.get("/:idOrSlug", getCombo);
router
  .route("/:id")
  .put(protect, authorize("admin", "manager"), updateCombo)
  .patch(protect, authorize("admin", "manager"), updateCombo)
  .delete(protect, authorize("admin", "manager"), deleteCombo);

export default router;
