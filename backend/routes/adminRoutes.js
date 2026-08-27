import express from "express";
import {
  getAdminUsers,
  getDashboard,
  searchAdmin,
} from "../controllers/adminController.js";
import { authorize, protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect, authorize("admin", "manager"));
router.get("/dashboard", getDashboard);
router.get("/users", getAdminUsers);
router.get("/search", searchAdmin);

export default router;
