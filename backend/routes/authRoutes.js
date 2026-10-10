import express from "express";
import { rejectClientRecordNumbers } from "../services/recordNumberService.js";
import {
  register,
  login,
  getMe,
  getSession,
  updateMe,
  logout,
  migrateSession,
  mobileAuth,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import { rateLimit } from "../middleware/security.js";

const router = express.Router();
router.use(rejectClientRecordNumbers);

const authLimit = rateLimit({ windowMs: 15 * 60_000, max: 20, keyPrefix: "auth" });
router.post("/register", authLimit, register);
router.post("/login", authLimit, login);
router.post("/mobile/register", authLimit, mobileAuth(register));
router.post("/mobile/login", authLimit, mobileAuth(login));
router.post("/migrate-session", protect, migrateSession);
router.post("/logout", logout);
router.get("/me", protect, getMe);
router.get("/session", protect, getSession);
router.put("/me", protect, updateMe);
router.patch("/me", protect, updateMe);

export default router;
