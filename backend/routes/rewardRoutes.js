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
import { authorize, protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/manage", protect, authorize("admin", "manager"), getManagedRewards);
router.get("/me", protect, getMyRewardAccount);
router.delete("/redemptions/:redemptionId", protect, cancelRewardRedemption);

router
  .route("/")
  .get(getRewards)
  .post(protect, authorize("admin", "manager"), createReward);

router.post("/:id/redeem", protect, redeemReward);
router
  .route("/:id")
  .get(getRewardById)
  .patch(protect, authorize("admin", "manager"), updateReward)
  .delete(protect, authorize("admin", "manager"), deleteReward);

export default router;
