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
  if (!cookieToken || Buffer.byteLength(cookieToken) !== Buffer.byteLength(headerToken) || !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    return res.status(403).json({ success: false, message: "Request verification failed" });
  }
  next();
};

const stores = new Map();
export const rateLimit = ({ windowMs = 60_000, max = 20, keyPrefix = "global" } = {}) => (req, res, next) => {
  const now = Date.now();
  const identity = req.verifiedClientIp || req.ip || req.socket?.remoteAddress || "unknown";
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
      res.set("RateLimit-Reset", String(Math.ceil((windowStart + windowMs - now) / 1000)));
      if (entry.count > max) res.set("Retry-After", String(Math.ceil((windowStart + windowMs - now) / 1000)));
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
  res.set("RateLimit-Reset", String(Math.ceil((entry.resetAt - now) / 1000)));
  if (stores.size > 10000) for (const [storedKey, value] of stores) if (value.resetAt <= now) stores.delete(storedKey);
  if (entry.count > max) res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
  if (entry.count > max) return res.status(429).json({ success: false, message: "Too many requests. Please try again later." });
  next();
};

// Only an authenticated server-to-server proxy can supply a client address.
export const verifyProxyIdentity = (req, _res, next) => {
  if (process.env.VERCEL) {
    const platformAddress = String(req.headers["x-vercel-forwarded-for"] || "").split(",")[0].trim();
    if (/^[0-9a-fA-F:.]{3,64}$/.test(platformAddress)) req.verifiedClientIp = platformAddress;
  }
  const expected = process.env.API_PROXY_SECRET || "";
  const supplied = String(req.headers["x-dg-proxy-secret"] || "");
  const address = String(req.headers["x-dg-client-ip"] || "");
  if (expected && Buffer.byteLength(expected) === Buffer.byteLength(supplied) && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)) && /^[0-9a-fA-F:.]{3,64}$/.test(address)) req.verifiedClientIp = address;
  next();
};

export const validateRequestStructure = (req, res, next) => {
  let visited = 0;
  const valid = (value, depth = 0) => {
    if (++visited > 10000 || depth > 20) return false;
    if (!value || typeof value !== "object") return true;
    return Object.entries(value).every(([key, entry]) => !key.startsWith("$") && !["__proto__", "constructor", "prototype"].includes(key) && valid(entry, depth + 1));
  };
  if (!valid(req.body) || !valid(req.query)) return res.status(400).json({ success: false, message: "Invalid request fields" });
  next();
};

export const safeErrorResponses = (_req, res, next) => {
  const json = res.json.bind(res);
  res.json = body => {
    if (process.env.NODE_ENV === "production" && body && typeof body === "object" && body.success === false) {
      const safe = { ...body }; delete safe.error; delete safe.stack;
      if (res.statusCode >= 500) safe.message = res.statusCode === 503 ? "Service temporarily unavailable. Reconnect and reconcile any pending order before retrying." : "The request could not be completed. Please retry or contact the restaurant.";
      return json(safe);
    }
    return json(body);
  };
  next();
};
