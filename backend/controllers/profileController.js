import mongoose from "mongoose";
import User from "../models/User.js";
import MenuItem from "../models/MenuItem.js";
import Order from "../models/Order.js";
import Review from "../models/Review.js";
import { getMembershipDetails } from "../utils/rewards.js";

const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  address: user.address,
  bio: user.bio,
  avatar: user.avatar,
  rewardPoints: user.rewardPoints,
  membershipTier: getMembershipDetails(user.rewardPoints).tier,
  createdAt: user.createdAt,
});

const findUser = (id) =>
  User.findById(id).populate({
    path: "favorites",
    match: { isAvailable: true },
  });

export const getDashboard = async (req, res) => {
  try {
    const [user, orders, reviews] = await Promise.all([
      findUser(req.user._id),
      Order.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .populate("items.menuItem", "name image price isAvailable"),
      Review.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .populate("menuItem", "name image")
        .populate("order", "orderNumber"),
    ]);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const favorites = user.favorites.filter(Boolean);
    const rewards = getMembershipDetails(user.rewardPoints);

    res.status(200).json({
      success: true,
      data: {
        user: publicUser(user),
        stats: {
          orders: orders.length,
          favorites: favorites.length,
          rewardPoints: user.rewardPoints,
          reviews: reviews.length,
        },
        rewards,
        recentOrders: orders.slice(0, 3),
        orders,
        favorites,
        addresses: user.addresses,
        paymentMethods: user.paymentMethods,
        reviews,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to load account dashboard",
      error: err.message,
    });
  }
};

export const getProfileStats = async (req, res) => {
  try {
    const [orders, reviews, user] = await Promise.all([
      Order.countDocuments({ user: req.user._id }),
      Review.countDocuments({ user: req.user._id }),
      User.findById(req.user._id),
    ]);

    res.status(200).json({
      success: true,
      data: {
        orders,
        favorites: user.favorites.length,
        rewardPoints: user.rewardPoints,
        reviews,
        rewards: getMembershipDetails(user.rewardPoints),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load stats" });
  }
};

const normalizeDefault = (items, selectedId) => {
  items.forEach((item) => {
    item.isDefault = item._id.toString() === selectedId.toString();
  });
};

export const getAddresses = async (req, res) => {
  res.status(200).json({ success: true, data: req.user.addresses });
};

export const addAddress = async (req, res) => {
  try {
    const { label, fullAddress, phone = "", isDefault = false } = req.body;
    if (!label || !fullAddress) {
      return res.status(400).json({
        success: false,
        message: "Address label and full address are required",
      });
    }

    const user = await User.findById(req.user._id);
    user.addresses.push({ label, fullAddress, phone, isDefault });
    const added = user.addresses[user.addresses.length - 1];
    if (isDefault || user.addresses.length === 1) {
      normalizeDefault(user.addresses, added._id);
      user.address = added.fullAddress;
    }
    await user.save();

    res.status(201).json({ success: true, data: user.addresses });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Failed to add address",
      error: err.message,
    });
  }
};

export const updateAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.id);
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    ["label", "fullAddress", "phone"].forEach((field) => {
      if (req.body[field] !== undefined) address[field] = req.body[field];
    });
    if (req.body.isDefault) normalizeDefault(user.addresses, address._id);
    if (address.isDefault) user.address = address.fullAddress;
    await user.save();

    res.status(200).json({ success: true, data: user.addresses });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Failed to update address",
      error: err.message,
    });
  }
};

export const setDefaultAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.id);
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }
    normalizeDefault(user.addresses, address._id);
    user.address = address.fullAddress;
    await user.save();
    res.status(200).json({ success: true, data: user.addresses });
  } catch (err) {
    res.status(400).json({ success: false, message: "Failed to set default address" });
  }
};

export const deleteAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.id);
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }
    const wasDefault = address.isDefault;
    address.deleteOne();
    if (wasDefault && user.addresses.length) {
      user.addresses[0].isDefault = true;
      user.address = user.addresses[0].fullAddress;
    } else if (!user.addresses.length) {
      user.address = "";
    }
    await user.save();
    res.status(200).json({ success: true, data: user.addresses });
  } catch (err) {
    res.status(400).json({ success: false, message: "Failed to delete address" });
  }
};

export const getFavorites = async (req, res) => {
  try {
    const user = await findUser(req.user._id);
    res.status(200).json({
      success: true,
      data: user.favorites.filter(Boolean),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load favorites" });
  }
};

export const addFavorite = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.menuItemId)) {
      return res.status(400).json({ success: false, message: "Invalid menu item" });
    }
    const item = await MenuItem.findOne({
      _id: req.params.menuItemId,
      isAvailable: true,
    });
    if (!item) {
      return res.status(404).json({ success: false, message: "Menu item not found" });
    }
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { favorites: item._id },
    });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: "Failed to add favorite" });
  }
};

export const removeFavorite = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { favorites: req.params.menuItemId },
    });
    res.status(200).json({ success: true, data: req.params.menuItemId });
  } catch (err) {
    res.status(400).json({ success: false, message: "Failed to remove favorite" });
  }
};

export const getPaymentMethods = async (req, res) => {
  res.status(200).json({ success: true, data: req.user.paymentMethods });
};

const paymentPayload = (body) => ({
  cardBrand: body.cardBrand,
  lastFourDigits: body.lastFourDigits,
  expiryMonth: body.expiryMonth,
  expiryYear: body.expiryYear,
  cardholderName: body.cardholderName,
  isDefault: Boolean(body.isDefault),
});

export const addPaymentMethod = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.paymentMethods.push(paymentPayload(req.body));
    const added = user.paymentMethods[user.paymentMethods.length - 1];
    if (added.isDefault || user.paymentMethods.length === 1) {
      normalizeDefault(user.paymentMethods, added._id);
    }
    await user.save();
    res.status(201).json({ success: true, data: user.paymentMethods });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Failed to add payment method",
      error: err.message,
    });
  }
};

export const updatePaymentMethod = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const method = user.paymentMethods.id(req.params.id);
    if (!method) {
      return res.status(404).json({ success: false, message: "Payment method not found" });
    }
    const safe = paymentPayload({ ...method.toObject(), ...req.body });
    Object.assign(method, safe);
    if (safe.isDefault) normalizeDefault(user.paymentMethods, method._id);
    await user.save();
    res.status(200).json({ success: true, data: user.paymentMethods });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Failed to update payment method",
      error: err.message,
    });
  }
};

export const setDefaultPaymentMethod = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const method = user.paymentMethods.id(req.params.id);
    if (!method) {
      return res.status(404).json({ success: false, message: "Payment method not found" });
    }
    normalizeDefault(user.paymentMethods, method._id);
    await user.save();
    res.status(200).json({ success: true, data: user.paymentMethods });
  } catch (err) {
    res.status(400).json({ success: false, message: "Failed to set default payment method" });
  }
};

export const deletePaymentMethod = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const method = user.paymentMethods.id(req.params.id);
    if (!method) {
      return res.status(404).json({ success: false, message: "Payment method not found" });
    }
    const wasDefault = method.isDefault;
    method.deleteOne();
    if (wasDefault && user.paymentMethods.length) {
      user.paymentMethods[0].isDefault = true;
    }
    await user.save();
    res.status(200).json({ success: true, data: user.paymentMethods });
  } catch (err) {
    res.status(400).json({ success: false, message: "Failed to delete payment method" });
  }
};

