import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { ensurePointsBalance } from "../services/rewardService.js";
import { clearSessionCookies, issueSessionCookies } from "../utils/httpCookies.js";

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role, sv: Number(user.sessionVersion || 0) }, process.env.JWT_SECRET, {
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
  pointsBalance: Math.max(0, Number(user.pointsBalance) || 0),
  createdAt: user.createdAt,
  isActive: user.isActive !== false,
});

export const validateNewPassword = (password) => {
  if (typeof password !== "string" || password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "Password must be at least 10 characters and include uppercase, lowercase, number and symbol";
  }
  return "";
};

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
    const passwordError = validateNewPassword(password);
    if (passwordError) return res.status(400).json({ success: false, message: passwordError });

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
    // Kitchen/manager/admin accounts should be provisioned privately, never through public registration.
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
      pointsBalance: 0,
    });
    issueSessionCookies(res, signToken(user));
    res.status(201).json({ success: true, user: sanitize(user) });
  } catch (err) {
    res
      .status(500)
      .json({
        success: false,
        message: "Registration failed",
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

    const user = await User.findOne({ email }).select("+password +sessionVersion");
    if (!user || user.isActive === false || !(await user.comparePassword(password))) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    await ensurePointsBalance(user._id);
    const currentUser = await User.findById(user._id);
    issueSessionCookies(res, signToken(user));
    res.status(200).json({ success: true, user: sanitize(currentUser) });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Login failed" });
  }
};

export const migrateSession = async (req, res) => {
  issueSessionCookies(res, signToken(req.user));
  res.json({ success: true, user: sanitize(req.user) });
};

export const logout = async (_req, res) => {
  clearSessionCookies(res);
  res.status(200).json({ success: true });
};

// @route GET /api/auth/me
export const getMe = async (req, res) => {
  await ensurePointsBalance(req.user._id);
  const user = await User.findById(req.user._id);
  res.status(200).json({ success: true, user: sanitize(user) });
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
    await ensurePointsBalance(user._id);
    const currentUser = await User.findById(user._id);
    res.status(200).json({ success: true, user: sanitize(currentUser) });
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
