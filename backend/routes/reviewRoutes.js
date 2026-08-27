import express from "express";
import { authorize, protect } from "../middleware/auth.js";
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
router.get("/manage", authorize("admin", "manager"), getAllReviewsForAdmin);
router.delete("/:id", authorize("admin", "manager"), deleteReview);

export default router;
