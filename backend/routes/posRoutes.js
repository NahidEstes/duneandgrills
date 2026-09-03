import express from "express";
import { createPosSale, listPosSales } from "../controllers/posController.js";
import { authorize, protect } from "../middleware/auth.js";

const router = express.Router();
router.use(protect, authorize("admin", "manager"));
router.route("/sales").get(listPosSales).post(createPosSale);

export default router;
