import crypto from "crypto";
import { CSRF_COOKIE, SESSION_COOKIE, parseCookies } from "../utils/httpCookies.js";
import RateLimitBucket from "../models/RateLimitBucket.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const securityHeaders = (_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  });
  next();
};

export const requestCorrelation = (req, res, next) => {
  const incoming = String(req.headers["x-request-id"] || "").trim();
  req.correlationId = /^[A-Za-z0-9._:-]{8,100}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.set("X-Request-Id", req.correlationId);
  next();
};

export const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const cookies = parseCookies(req.headers.cookie);
  if (!cookies[SESSION_COOKIE]) return next();
  const cookieToken = cookies[CSRF_COOKIE] || "";
  const headerToken = String(req.headers["x-csrf-token"] || "");
  if (!cookieToken || cookieToken.length !== headerToken.length || !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    return res.status(403).json({ success: false, message: "Request verification failed" });
  }
  next();
};

const stores = new Map();
export const rateLimit = ({ windowMs = 60_000, max = 20, keyPrefix = "global" } = {}) => (req, res, next) => {
  const now = Date.now();
  const identity = req.ip || req.socket?.remoteAddress || "unknown";
  const key = `${keyPrefix}:${identity}`;
  if (process.env.NODE_ENV === "production") {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const bucketId = crypto.createHash("sha256").update(`${key}:${windowStart}`).digest("hex");
    return RateLimitBucket.findOneAndUpdate(
      { _id: bucketId },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + windowMs) } },
      { upsert: true, new: true }
    ).then((entry) => {
      res.set("RateLimit-Limit", String(max));
      res.set("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
      if (entry.count > max) return res.status(429).json({ success: false, message: "Too many requests. Please try again later." });
      return next();
    }).catch(next);
  }
  const current = stores.get(key);
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  entry.count += 1;
  stores.set(key, entry);
  res.set("RateLimit-Limit", String(max));
  res.set("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
  if (entry.count > max) return res.status(429).json({ success: false, message: "Too many requests. Please try again later." });
  next();
};
