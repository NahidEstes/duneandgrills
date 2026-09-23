import express from "express";
import {
  getBlogPosts,
  getAllBlogPostsForAdmin,
  getBlogPostBySlug,
  getRelatedBlogPosts,
  getBlogPostById,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  getBlogCategoryCounts,
} from "../controllers/blogController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";

const router = express.Router();

router.get(
  "/manage",
  protect,
  requireCapability(CAPABILITIES.CATALOG_MANAGE),
  getAllBlogPostsForAdmin
);

router
  .route("/")
  .get(getBlogPosts)
  .post(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), createBlogPost);

router.get("/categories", getBlogCategoryCounts);
router.get("/slug/:slug/related", getRelatedBlogPosts);
router.get("/slug/:slug", getBlogPostBySlug);

router
  .route("/:id")
  .get(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), getBlogPostById)
  .put(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), updateBlogPost)
  .delete(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), deleteBlogPost);

export default router;
