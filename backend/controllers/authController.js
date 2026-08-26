import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { getMembershipDetails } from "../utils/rewards.js";

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

const sanitize = (user) => ({
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

// @route POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body;
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Name, email and password are required",
        });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res
        .status(409)
        .json({
          success: false,
          message: "An account with this email already exists",
        });
    }

    // Public registration always creates a customer account.
    // Manager/admin accounts should be created manually in the database or by an existing admin.
    const user = await User.create({
      name,
      email,
      password,
      phone,
      address,
      addresses: address
        ? [
            {
              label: "Home",
              fullAddress: address,
              phone: phone || "",
              isDefault: true,
            },
          ]
        : [],
      role: "customer",
    });
    const token = signToken(user);

    res.status(201).json({ success: true, token, user: sanitize(user) });
  } catch (err) {
    res
      .status(500)
      .json({
        success: false,
        message: "Registration failed",
        error: err.message,
      });
  }
};

// @route POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const token = signToken(user);
    res.status(200).json({ success: true, token, user: sanitize(user) });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Login failed", error: err.message });
  }
};

// @route GET /api/auth/me
export const getMe = async (req, res) => {
  res.status(200).json({ success: true, user: sanitize(req.user) });
};

// @route PATCH /api/auth/me
export const updateMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const allowedFields = ["name", "email", "phone", "address", "bio", "avatar"];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) user[field] = req.body[field];
    });

    if (req.body.address !== undefined) {
      const defaultAddress = user.addresses.find((entry) => entry.isDefault);
      if (defaultAddress) defaultAddress.fullAddress = req.body.address;
    }

    await user.save();
    res.status(200).json({ success: true, user: sanitize(user) });
  } catch (err) {
    const duplicateEmail = err.code === 11000;
    res
      .status(duplicateEmail ? 409 : 400)
      .json({
        success: false,
        message: duplicateEmail ? "That email is already in use" : "Update failed",
        error: err.message,
      });
  }
};
