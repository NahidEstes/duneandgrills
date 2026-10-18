import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import User from "../models/User.js";
import { validateNewPassword } from "./authController.js";
import { accountEmailConfiguration, accountEmailHash, queueAccountEmail, tokenHash, processAccountEmails } from "../services/customerAccountEmailService.js";
import { clearSessionCookies } from "../utils/httpCookies.js";
import { rateLimit } from "../middleware/security.js";

const email = value => typeof value === "string" ? value.trim().toLowerCase() : "";
const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const accountIdentity = req => accountEmailHash(email(req.body.email));
export const accountRequestCooldown = rateLimit({ windowMs: 60_000, max: 1, keyPrefix: "account-email-cooldown", identity: accountIdentity });
export const accountRequestBudget = rateLimit({ windowMs: 15 * 60_000, max: 3, keyPrefix: "account-email-address", identity: accountIdentity });
export const accountEmailAvailability = (_req, res) => res.set("Cache-Control", "private, no-store").json({ success: true, data: { configured: accountEmailConfiguration().configured } });
export const requestAccountEmail = kind => async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const address = email(req.body.email);
  if (!validEmail(address)) return res.status(400).json({ success: false, code: "INVALID_EMAIL", message: "Enter a valid email address." });
  try { const result = await queueAccountEmail(address, kind, req.body.language); res.status(202).json({ success: true, ...result }); }
  catch (error) { res.status(503).json({ success: false, code: error.code || "ACCOUNT_EMAIL_UNAVAILABLE", message: "Account email is currently unavailable. Contact the restaurant or try again later." }); }
};
const invalidLink = res => res.status(400).json({ success: false, code: "ACCOUNT_LINK_INVALID", message: "This link is invalid, expired or already used. Request a new link." });
const validToken = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const resetCustomerPassword = async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  if (!validToken(req.body.token)) return invalidLink(res);
  const error = validateNewPassword(req.body.password);
  if (error) return res.status(400).json({ success: false, code: "PASSWORD_POLICY", message: error });
  if (req.body.password !== req.body.confirmPassword) return res.status(400).json({ success: false, code: "PASSWORD_MISMATCH", message: "Passwords do not match." });
  try {
    const password = await bcrypt.hash(req.body.password, 10);
    const user = await User.findOneAndUpdate({ role: "customer", isActive: { $ne: false }, passwordResetTokenHash: tokenHash(req.body.token), passwordResetExpiresAt: { $gt: new Date() } }, { $set: { password }, $inc: { sessionVersion: 1 }, $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, passwordResetRequestId: 1 } }, { new: true }).select("_id");
    if (!user) return invalidLink(res);
    clearSessionCookies(res); return res.json({ success: true, code: "PASSWORD_RESET", message: "Password reset. Sign in again with your new password." });
  } catch { return res.status(503).json({ success: false, code: "ACCOUNT_ACTION_UNAVAILABLE", message: "Account service is unavailable. Please retry." }); }
};
export const verifyCustomerEmail = async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  if (!validToken(req.body.token)) return invalidLink(res);
  try {
    const user = await User.findOneAndUpdate({ role: "customer", isActive: { $ne: false }, emailVerificationTokenHash: tokenHash(req.body.token), emailVerificationExpiresAt: { $gt: new Date() } }, { $set: { emailVerifiedAt: new Date(), emailVerificationRequired: false }, $unset: { emailVerificationTokenHash: 1, emailVerificationExpiresAt: 1, emailVerificationRequestId: 1 } }, { new: true }).select("_id");
    if (!user) return invalidLink(res);
    return res.json({ success: true, code: "EMAIL_VERIFIED", message: "Email verified. You can return to your account." });
  } catch { return res.status(503).json({ success: false, code: "ACCOUNT_ACTION_UNAVAILABLE", message: "Account service is unavailable. Please retry." }); }
};
export const processCustomerEmailJobs = async (req, res) => {
  const expected = process.env.CUSTOMER_EMAIL_WORKER_SECRET || "", supplied = String(req.headers.authorization || "").replace(/^Bearer /, "");
  if (expected.length < 32 || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return res.status(403).json({ success: false, message: "Not authorized" });
  res.set("Cache-Control", "private, no-store");
  try { return res.json({ success: true, data: await processAccountEmails() }); }
  catch { return res.status(503).json({ success: false, code: "ACCOUNT_EMAIL_UNAVAILABLE", message: "Account email worker is unavailable." }); }
};
