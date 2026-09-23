import express from "express";
import {
  register,
  login,
  getMe,
  updateMe,
  logout,
  migrateSession,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import { rateLimit } from "../middleware/security.js";

const router = express.Router();

const authLimit = rateLimit({ windowMs: 15 * 60_000, max: 20, keyPrefix: "auth" });
router.post("/register", authLimit, register);
router.post("/login", authLimit, login);
router.post("/migrate-session", protect, migrateSession);
router.post("/logout", logout);
router.get("/me", protect, getMe);
router.put("/me", protect, updateMe);
router.patch("/me", protect, updateMe);

export default router;
