import express from "express";
import {
  cancelRewardRedemption,
  createReward,
  deleteReward,
  getManagedRewards,
  getMyRewardAccount,
  getRewardById,
  getRewards,
  redeemReward,
  updateReward,
} from "../controllers/rewardController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";

const router = express.Router();

router.get("/manage", protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), getManagedRewards);
router.get("/me", protect, getMyRewardAccount);
router.delete("/redemptions/:redemptionId", protect, cancelRewardRedemption);

router
  .route("/")
  .get(getRewards)
  .post(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), createReward);

router.post("/:id/redeem", protect, redeemReward);
router
  .route("/:id")
  .get(getRewardById)
  .patch(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), updateReward)
  .delete(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), deleteReward);

export default router;
