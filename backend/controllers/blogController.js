import BlogPost from "../models/BlogPost.js";

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
    const { category, all } = req.query;
    const filter = {};
    if (category && category !== "All") filter.category = category;
    // Public visitors only see published posts; dashboard passes ?all=true
    if (!all) filter.isPublished = true;

    const posts = await BlogPost.find(filter).sort({ createdAt: -1 });
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

// @desc    Get a single post by slug (public)
// @route   GET /api/blog/slug/:slug
export const getBlogPostBySlug = async (req, res) => {
  try {
    const post = await BlogPost.findOne({
      slug: req.params.slug,
      isPublished: true,
    });
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }
    res.status(200).json({ success: true, data: post });
  } catch (err) {
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch post",
        error: err.message,
      });
  }
};

// @desc    Get a single post by id (admin edit form)
// @route   GET /api/blog/:id
export const getBlogPostById = async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    res.status(200).json({ success: true, data: post });
  } catch (err) {
    res
      .status(500)
      .json({
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
    const post = await BlogPost.create({ ...req.body, slug });
    res.status(201).json({ success: true, data: post });
  } catch (err) {
    res
      .status(400)
      .json({
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
    const payload = { ...req.body };
    if (payload.title) payload.slug = slugify(payload.title);

    const post = await BlogPost.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    res.status(200).json({ success: true, data: post });
  } catch (err) {
    res
      .status(400)
      .json({
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
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete post",
        error: err.message,
      });
  }
};
