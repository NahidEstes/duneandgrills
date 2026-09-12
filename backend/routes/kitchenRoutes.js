import express from "express";
import { getKitchenQueue, updateKitchenOrderStatus } from "../controllers/kitchenController.js";
import { authorize, protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect, authorize("admin", "manager", "kitchen"));
router.get("/orders", getKitchenQueue);
router.patch("/orders/:id/status", updateKitchenOrderStatus);

export default router;
