import crypto from "node:crypto";
import { rateLimit } from "./security.js";
const client = req => req.verifiedClientIp || req.ip || req.socket?.remoteAddress || "unknown";
// Bound lookup cost per address, but reserve a separate budget for verified
// capabilities. Failed guesses cannot exhaust an order holder's polling budget.
export const trackingIngressLimit = rateLimit({ windowMs: 60_000, max: 120, keyPrefix: "tracking-ingress" });
export const invalidTrackingLimit = rateLimit({ windowMs: 15 * 60_000, max: 30, keyPrefix: "tracking-invalid" });
export const validTrackingLimit = rateLimit({ windowMs: 60_000, max: 12, keyPrefix: "tracking-valid", identity: req => crypto.createHash("sha256").update(`${client(req)}:${req.params.orderNumber}:${req.headers["x-order-tracking-token"] || ""}`).digest("hex") });
