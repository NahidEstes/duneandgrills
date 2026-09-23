import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { hasCapability } from "../config/permissions.js";
import { parseCookies, SESSION_COOKIE } from "../utils/httpCookies.js";

// Verifies the JWT and attaches the user to req.user
const authenticate = async (req, res, next, { required }) => {
  try {
    const authHeader = req.headers.authorization;
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const cookieToken = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const token = cookieToken || bearer;
    if (!token) return required ? res.status(401).json({ success: false, message: "Not authenticated" }) : next();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("+sessionVersion");
    if (!user || user.isActive === false || Number(decoded.sv || 0) !== Number(user.sessionVersion || 0)) {
      return res
        .status(401)
        .json({ success: false, message: "Session is no longer valid" });
    }

    req.user = user;
    req.authStrategy = cookieToken ? "cookie" : "bearer";
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};

export const protect = (req, res, next) => authenticate(req, res, next, { required: true });
export const optionalAuth = (req, res, next) => authenticate(req, res, next, { required: false });

// Restricts access to specific roles, e.g. authorize("admin", "manager")
export const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized for this action" });
    }
    next();
  };

export const requireCapability = (capability) => (req, res, next) => {
  if (!req.user || !hasCapability(req.user.role, capability)) {
    return res.status(403).json({ success: false, message: "Not authorized for this action" });
  }
  next();
};
