import BlogPost from "../models/BlogPost.js";
import ContentCategory from "../models/ContentCategory.js";
import {
  CATEGORY_TYPES,
  getPublicCategoryMatch,
  resolveCategory,
  serializeCategory,
  synchronizeLegacyCategories,
} from "../services/categoryService.js";

// Turns "10 Spices Every Grill Master Needs" into "10-spices-every-grill-master-needs"
const slugify = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");

// @desc    Get all published blog posts (public), or all posts for admins
// @route   GET /api/blog?category=Recipes
export const getBlogPosts = async (req, res) => {
  try {
    const { category, search, limit, excludeSlug } = req.query;
    const categoryMatch = await getPublicCategoryMatch(
      CATEGORY_TYPES.BLOG,
      category
    );
    const filter = { isPublished: true, $and: [categoryMatch] };
    if (excludeSlug) filter.slug = { $ne: excludeSlug };
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
      ];
    }

    let query = BlogPost.find(filter)
      .populate("categoryRef", "name slug isActive type")
      .sort({ createdAt: -1 });
    if (limit) query = query.limit(Number(limit));

    const posts = await query;
    res.status(200).json({ success: true, count: posts.length, data: posts });
  } catch (err) {
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch blog posts",
        error: err.message,
      });
  }
};

export const getAllBlogPostsForAdmin = async (req, res) => {
  try {
    await synchronizeLegacyCategories();
    const posts = await BlogPost.find()
      .populate("categoryRef", "name slug isActive type")
      .sort({ updatedAt: -1 });
    res.status(200).json({ success: true, count: posts.length, data: posts });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch blog posts",
      error: err.message,
    });
  }
};

// @desc    Get published post counts grouped by category (for the sidebar)
// @route   GET /api/blog/categories
export const getBlogCategoryCounts = async (req, res) => {
  try {
    await synchronizeLegacyCategories();
    const categories = await ContentCategory.find({
      type: CATEGORY_TYPES.BLOG,
      isActive: true,
    }).sort({ sortOrder: 1, name: 1 });
    const summaries = await Promise.all(categories.map(serializeCategory));
    const data = summaries.map((category) => ({
      _id: category._id,
      category: category.name,
      slug: category.slug,
      count: category.visibleCount,
    }));
    res.status(200).json({ success: true, data });
  } catch (err) {
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch category counts",
        error: err.message,
      });
  }
};
// @desc    Get a single post by slug (public)
// @route   GET /api/blog/slug/:slug
export const getBlogPostBySlug = async (req, res) => {
  try {
    const categoryMatch = await getPublicCategoryMatch(CATEGORY_TYPES.BLOG);
    const post = await BlogPost.findOne({
      slug: req.params.slug,
      isPublished: true,
      $and: [categoryMatch],
    }).populate("categoryRef", "name slug isActive type");
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }
    res.status(200).json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch post",
      error: err.message,
    });
  }
};

// @desc    Get related published posts ranked by category, shared tags, then recency
// @route   GET /api/blog/slug/:slug/related
export const getRelatedBlogPosts = async (req, res) => {
  try {
    const categoryMatch = await getPublicCategoryMatch(CATEGORY_TYPES.BLOG);
    const currentPost = await BlogPost.findOne({
      slug: req.params.slug,
      isPublished: true,
      $and: [categoryMatch],
    }).select("_id category tags");

    if (!currentPost) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 6)
      : 3;

    const posts = await BlogPost.aggregate([
      {
        $match: {
          _id: { $ne: currentPost._id },
          isPublished: true,
          $and: [categoryMatch],
        },
      },
      {
        $addFields: {
          relevanceScore: {
            $add: [
              {
                $cond: [
                  { $eq: ["$category", currentPost.category] },
                  100,
                  0,
                ],
              },
              {
                $multiply: [
                  {
                    $size: {
                      $setIntersection: [
                        { $ifNull: ["$tags", []] },
                        currentPost.tags || [],
                      ],
                    },
                  },
                  10,
                ],
              },
            ],
          },
        },
      },
      { $sort: { relevanceScore: -1, createdAt: -1 } },
      { $limit: limit },
      { $project: { relevanceScore: 0 } },
    ]);

    return res.status(200).json({
      success: true,
      count: posts.length,
      data: posts,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch related posts",
      error: err.message,
    });
  }
};

// @desc    Get a single post by id (admin edit form)
// @route   GET /api/blog/:id
export const getBlogPostById = async (req, res) => {
  try {
    await synchronizeLegacyCategories();
    const post = await BlogPost.findById(req.params.id).populate(
      "categoryRef",
      "name slug isActive type"
    );
    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    res.status(200).json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch post",
      error: err.message,
    });
  }
};

// @desc    Create a blog post
// @route   POST /api/blog
export const createBlogPost = async (req, res) => {
  try {
    const slug = slugify(req.body.title);
    const categoryValues = await resolveCategory({
      type: CATEGORY_TYPES.BLOG,
      categoryId: req.body.categoryId,
      categoryName: req.body.category,
    });
    const post = await BlogPost.create({
      ...req.body,
      ...categoryValues,
      slug,
    });
    await post.populate("categoryRef", "name slug isActive type");
    res.status(201).json({ success: true, data: post });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Failed to create post",
      error: err.message,
    });
  }
};

// @desc    Update a blog post
// @route   PUT /api/blog/:id
export const updateBlogPost = async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });

    const payload = { ...req.body };
    if (payload.title) payload.slug = slugify(payload.title);

    if (payload.categoryId !== undefined || payload.category !== undefined) {
      const sameCategory = payload.categoryId
        ? post.categoryRef?.toString() === String(payload.categoryId)
        : post.category.toLowerCase() ===
          String(payload.category || "").trim().toLowerCase();
      Object.assign(
        payload,
        await resolveCategory({
          type: CATEGORY_TYPES.BLOG,
          categoryId: payload.categoryId,
          categoryName: payload.category,
          allowInactive: sameCategory,
        })
      );
    }

    post.set(payload);
    await post.save();
    await post.populate("categoryRef", "name slug isActive type");
    res.status(200).json({ success: true, data: post });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Failed to update post",
      error: err.message,
    });
  }
};

// @desc    Delete a blog post
// @route   DELETE /api/blog/:id
export const deleteBlogPost = async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndDelete(req.params.id);
    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    res.status(200).json({ success: true, message: "Post deleted" });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to delete post",
      error: err.message,
    });
  }
};
