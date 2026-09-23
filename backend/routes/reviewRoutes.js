import express from "express";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";
import {
  createReview,
  deleteReview,
  getAllReviewsForAdmin,
  getMyReviews,
} from "../controllers/reviewController.js";

const router = express.Router();
router.use(protect);

router.route("/").post(createReview);
router.get("/me", getMyReviews);
router.get("/manage", requireCapability(CAPABILITIES.REVIEWS_MANAGE), getAllReviewsForAdmin);
router.delete("/:id", requireCapability(CAPABILITIES.REVIEWS_MANAGE), deleteReview);

export default router;
