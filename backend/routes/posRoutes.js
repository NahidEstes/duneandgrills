import express from "express";
import { createPosSale, listPosSales } from "../controllers/posController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";

const router = express.Router();
router.use(protect, requireCapability(CAPABILITIES.POS_OPERATE));
router.route("/sales").get(listPosSales).post(createPosSale);

export default router;
