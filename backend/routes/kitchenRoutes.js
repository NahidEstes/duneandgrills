import express from "express";
import { getKitchenQueue, updateKitchenOrderStatus } from "../controllers/kitchenController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";
import { authorize } from "../middleware/auth.js";
import { getInstruction, getInstructionManual, listInstructionInventoryOptions, listInstructions, saveInstruction, historyInstructions, trialInstructions, recordInstructionTrial, transitionInstruction } from "../controllers/recipeInstructionController.js";

const router = express.Router();

router.use(protect, requireCapability(CAPABILITIES.KITCHEN_OPERATE));
router.get("/recipes", listInstructions);
router.get("/recipes/manual", authorize("admin", "manager"), getInstructionManual);
router.get("/recipes/inventory-options", authorize("admin", "manager"), listInstructionInventoryOptions);
router.get("/recipes/:code/history", historyInstructions);
router.get("/recipes/:code/trials", trialInstructions);
router.post("/recipes/:code/trials", recordInstructionTrial);
router.post("/recipes/:code/workflow/:action", authorize("admin", "manager"), transitionInstruction);
router.get("/recipes/:code", getInstruction);
router.put("/recipes/:code", authorize("admin", "manager"), saveInstruction);
router.get("/orders", getKitchenQueue);
router.patch("/orders/:id/status", updateKitchenOrderStatus);

export default router;
