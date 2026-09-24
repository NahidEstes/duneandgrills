import express from "express";
import { createPosSale, listPosSales } from "../controllers/posController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";
import { closeShift, currentShift, getShift, getShiftConfig, listShifts, openShift, postCashMovement, reopenShift } from "../controllers/posShiftController.js";

const router = express.Router();
router.use(protect, requireCapability(CAPABILITIES.POS_OPERATE));
router.route("/sales").get(listPosSales).post(createPosSale);
router.get("/shift-config", getShiftConfig);
router.get("/shifts/current", currentShift);
router.post("/shifts/open", openShift);
router.post("/shifts/:shiftId/cash-movements", postCashMovement);
router.post("/shifts/:shiftId/close", closeShift);
router.get("/shifts", requireCapability(CAPABILITIES.POS_SHIFT_MANAGE), listShifts);
router.get("/shifts/:shiftId", requireCapability(CAPABILITIES.POS_SHIFT_MANAGE), getShift);
router.post("/shifts/:shiftId/reopen", requireCapability(CAPABILITIES.POS_SHIFT_MANAGE), reopenShift);

export default router;
