import crypto from "node:crypto";
import User from "../models/User.js";
import CustomerEmailJob from "../models/CustomerEmailJob.js";

export const accountEmailHash = value => crypto.createHash("sha256").update(String(value).trim().toLowerCase()).digest("hex");
export const tokenHash = value => crypto.createHash("sha256").update(value).digest("hex");
export const ACCOUNT_TOKEN_FIELDS = {
  reset: { hash: "passwordResetTokenHash", expires: "passwordResetExpiresAt", request: "passwordResetRequestId", lifetime: 30 * 60_000 },
  verify: { hash: "emailVerificationTokenHash", expires: "emailVerificationExpiresAt", request: "emailVerificationRequestId", lifetime: 24 * 60 * 60_000 },
};
export function accountEmailConfiguration(env = process.env) {
  let origin;
  try { const url = new URL(env.CUSTOMER_WEB_ORIGIN); if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || (url.protocol !== "https:" && !(env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol === "http:"))) throw new Error(); origin = url.origin; } catch { /* Fail closed; never construct links from a request Host header. */ }
  const configured = Boolean(env.CUSTOMER_EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY && /^[^\r\n]+@[^\r\n]+$/.test(env.CUSTOMER_EMAIL_FROM || "") && origin && (env.CUSTOMER_EMAIL_TOKEN_SECRET || "").length >= 32 && (env.CUSTOMER_EMAIL_WORKER_SECRET || "").length >= 32);
  return { configured, origin, provider: "resend" };
}
export const accountEmailUnavailable = () => Object.assign(new Error("Account email is currently unavailable. Contact the restaurant or try again later."), { status: 503, code: "ACCOUNT_EMAIL_UNAVAILABLE" });
// A dedicated secret makes a reproducible 256-bit capability for provider retries.
// The job contains no capability; the User holds only its SHA-256 hash.
export const accountJobToken = (job, secret = process.env.CUSTOMER_EMAIL_TOKEN_SECRET) => crypto.createHmac("sha256", secret).update(`customer-account-v1:${job._id}:${job.kind}:${job.user}:${job.emailHash}`).digest("hex");

export async function queueAccountEmail(email, kind, language = "en", { now = new Date() } = {}) {
  if (!accountEmailConfiguration().configured) throw accountEmailUnavailable();
  const user = await User.findOne({ email, role: "customer", isActive: { $ne: false }, ...(kind === "verify" ? { emailVerifiedAt: null } : {}) }).select("_id email").lean();
  const fields = ACCOUNT_TOKEN_FIELDS[kind];
  const job = new CustomerEmailJob({ user: user?._id || null, kind, language: language === "ar" ? "ar" : "en", emailHash: accountEmailHash(email), expiresAt: new Date(now.getTime() + fields.lifetime) });
  // Do the same bounded write path for absent/staff accounts; no identity is returned.
  const result = await User.updateOne({ _id: user?._id || job._id, email, role: "customer", isActive: { $ne: false }, $or: [{ accountEmailRequestedAt: { $lt: new Date(now.getTime() - 60_000) } }, { accountEmailRequestedAt: { $exists: false } }] }, { $set: { [fields.hash]: tokenHash(accountJobToken(job)), [fields.expires]: job.expiresAt, [fields.request]: job._id, accountEmailRequestedAt: now } });
  if (!result.matchedCount) job.user = null;
  if (!job.user) job.status = "cancelled";
  await job.save();
  return { status: "accepted", code: "ACCOUNT_EMAIL_REQUEST_ACCEPTED", retryAfterSeconds: 60,
    message: "If this customer account is eligible, an email request has been queued. This does not confirm delivery. Check your inbox; request another link if none arrives." };
}

export function accountEmailMessage(job, user, token, origin) {
  const reset = job.kind === "reset", ar = job.language === "ar";
  const link = `${origin}/${reset ? "reset-password" : "verify-email"}#token=${token}`;
  const title = ar ? reset ? "إعادة تعيين كلمة المرور" : "تأكيد البريد الإلكتروني" : reset ? "Reset your password" : "Verify your email";
  const body = ar ? "افتح الرابط لإكمال طلبك. الرابط شخصي ويُستخدم مرة واحدة. إذا لم تطلب ذلك، تجاهل هذه الرسالة." : "Open the link to complete your request. This private link can be used once. If you did not request it, ignore this email.";
  return { from: process.env.CUSTOMER_EMAIL_FROM, to: [user.email], subject: `Dune & Grills — ${title}`, text: `${title}\n\n${body}\n\n${link}\n\n${ar ? "تنتهي صلاحية الرابط:" : "Link expires:"} ${job.expiresAt.toISOString()}` };
}
export async function sendAccountEmail(message, key, { fetcher = fetch } = {}) {
  const response = await fetcher("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(message), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw Object.assign(new Error("Email provider did not accept the request"), { code: "EMAIL_PROVIDER_UNAVAILABLE" });
  const result = await response.json();
  if (!result.id) throw Object.assign(new Error("Email provider acceptance was not confirmed"), { code: "EMAIL_PROVIDER_UNAVAILABLE" });
}
export async function processAccountEmails({ limit = 3, deliver = sendAccountEmail, now = () => new Date() } = {}) {
  const configuration = accountEmailConfiguration(); if (!configuration.configured) throw accountEmailUnavailable();
  const summary = { accepted: 0, cancelled: 0, retry: 0 };
  for (let index = 0; index < Math.min(limit, 5); index++) {
    const clock = now();
    const job = await CustomerEmailJob.findOneAndUpdate({ expiresAt: { $gt: clock }, $or: [{ status: { $in: ["queued", "retry"] }, availableAt: { $lte: clock } }, { status: "processing", lockedUntil: { $lte: clock } }] }, { $set: { status: "processing", lockedUntil: new Date(clock.getTime() + 60_000) }, $inc: { attempts: 1 } }, { sort: { createdAt: 1 }, new: true });
    if (!job) break;
    try {
      const fields = ACCOUNT_TOKEN_FIELDS[job.kind], token = accountJobToken(job);
      const user = job.user && await User.findOne({ _id: job.user, role: "customer", isActive: { $ne: false }, [fields.hash]: tokenHash(token), [fields.request]: job._id, [fields.expires]: { $gt: clock } }).select("email").lean();
      if (!user || accountEmailHash(user.email) !== job.emailHash) { job.status = "cancelled"; summary.cancelled++; }
      else { await deliver(accountEmailMessage(job, user, token, configuration.origin), `customer-account/${job._id}`); job.status = "accepted"; job.acceptedAt = now(); summary.accepted++; }
    } catch { job.status = job.attempts >= 5 ? "failed" : "retry"; job.lastError = "EMAIL_PROVIDER_UNAVAILABLE"; job.availableAt = new Date(now().getTime() + Math.min(30 * 60_000, 60_000 * 2 ** job.attempts)); summary.retry++; }
    job.lockedUntil = null; await job.save();
  }
  return summary;
}
