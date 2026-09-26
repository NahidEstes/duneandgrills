import express from "express";
import {
  archiveShift,
  clockIn,
  clockOut,
  correctAttendance,
  createLeave,
  createShift,
  getAttendance,
  getMonthlyAttendance,
  identifyClockStaff,
  listAttendance,
  listLeaves,
  listShifts,
  updateLeave,
  updateShift,
} from "../controllers/attendanceController.js";
import { CAPABILITIES } from "../config/permissions.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { rateLimit } from "../middleware/security.js";

const router = express.Router();
const clockIdentifyLimit = rateLimit({ windowMs: 5 * 60_000, max: 10, keyPrefix: "staff-clock-identify" });
const clockActionLimit = rateLimit({ windowMs: 5 * 60_000, max: 20, keyPrefix: "staff-clock-action" });

router.post("/clock/identify", clockIdentifyLimit, identifyClockStaff);
router.post("/clock/in", clockActionLimit, clockIn);
router.post("/clock/out", clockActionLimit, clockOut);

router.use(protect, requireCapability(CAPABILITIES.ATTENDANCE_READ));
router.get("/records", listAttendance);
router.get("/reports/monthly", getMonthlyAttendance);
router.get("/records/:id", getAttendance);
router.get("/shifts", listShifts);
router.get("/leave", listLeaves);

const manage = requireCapability(CAPABILITIES.ATTENDANCE_MANAGE);
router.patch("/records/:id", manage, correctAttendance);
router.post("/shifts", manage, createShift);
router.patch("/shifts/:id", manage, updateShift);
router.post("/shifts/:id/archive", manage, archiveShift);
router.post("/leave", manage, createLeave);
router.patch("/leave/:id", manage, updateLeave);

export default router;
