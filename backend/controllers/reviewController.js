import Review from "../models/Review.js";
import Order from "../models/Order.js";

export const getAllReviewsForAdmin = async (req, res) => {
  try {
    const reviews = await Review.find()
      .sort({ createdAt: -1 })
      .populate("user", "name email avatar")
      .populate("menuItem", "name image")
      .populate("order", "orderNumber status");
    res.status(200).json({ success: true, count: reviews.length, data: reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load reviews" });
  }
};

export const deleteReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }
    return res.status(200).json({ success: true, message: "Review deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to delete review" });
  }
};

export const getMyReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("menuItem", "name image")
      .populate("order", "orderNumber");
    res.status(200).json({ success: true, count: reviews.length, data: reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load reviews" });
  }
};

export const createReview = async (req, res) => {
  try {
    const { order: orderId, menuItem, rating, comment } = req.body;
    if (!orderId || !menuItem || !rating || !comment?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Order, menu item, rating and comment are required",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
      status: "delivered",
      "items.menuItem": menuItem,
    });
    if (!order) {
      return res.status(403).json({
        success: false,
        message: "Reviews are available only for delivered items you ordered",
      });
    }

    const review = await Review.create({
      user: req.user._id,
      order: order._id,
      menuItem,
      rating,
      comment: comment.trim(),
    });
    await review.populate("menuItem", "name image");
    await review.populate("order", "orderNumber");
    res.status(201).json({ success: true, data: review });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You already reviewed this item from this order",
      });
    }
    res.status(400).json({
      success: false,
      message: "Failed to create review",
      error: err.message,
    });
  }
};
