import express from "express";
import { protect } from "../middleware/auth.js";
import { createReview, getMyReviews } from "../controllers/reviewController.js";

const router = express.Router();
router.use(protect);

router.route("/").post(createReview);
router.get("/me", getMyReviews);

export default router;

