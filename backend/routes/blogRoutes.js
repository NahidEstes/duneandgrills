import express from "express";
import {
  getBlogPosts,
  getBlogPostBySlug,
  getBlogPostById,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  getBlogCategoryCounts,
} from "../controllers/blogController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

router
  .route("/")
  .get(getBlogPosts)
  .post(protect, authorize("admin", "manager"), createBlogPost);

router.get("/categories", getBlogCategoryCounts);
router.get("/slug/:slug", getBlogPostBySlug);

router
  .route("/:id")
  .get(protect, authorize("admin", "manager"), getBlogPostById)
  .put(protect, authorize("admin", "manager"), updateBlogPost)
  .delete(protect, authorize("admin", "manager"), deleteBlogPost);

export default router;
