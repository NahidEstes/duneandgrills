import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";

const sessionOptions = (session) => (session ? { session } : {});

const SENSITIVE_KEY = /(password|token|cookie|secret|credential|authorization|trackingTokenHash)/i;

const sanitizeValue = (value, depth = 0) => {
  if (depth > 8 || value == null) return value ?? null;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.slice(0, 250).map((entry) => sanitizeValue(entry, depth + 1));
  if (typeof value === "object") {
    const source = typeof value.toObject === "function" ? value.toObject({ depopulate: true }) : value;
    return Object.fromEntries(Object.entries(source).filter(([key]) => !SENSITIVE_KEY.test(key)).map(([key, entry]) => [key, sanitizeValue(entry, depth + 1)]));
  }
  return value;
};

const plainValue = (value) => {
  if (value == null) return null;
  return sanitizeValue(value);
};

export const auditDiff = (before = {}, after = {}) => {
  const changedFields = [];
  const walk = (left, right, path = "") => {
    if (JSON.stringify(left) === JSON.stringify(right)) return;
    const bothObjects = left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right);
    if (bothObjects) {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) walk(left[key], right[key], path ? `${path}.${key}` : key);
      return;
    }
    if (path) changedFields.push(path);
  };
  walk(plainValue(before) || {}, plainValue(after) || {});
  return [...new Set(changedFields)];
};

export const pickAuditFields = (source, fields) => Object.fromEntries(
  fields.filter((field) => source?.[field] !== undefined).map((field) => [field, plainValue(source[field])])
);

export const recordAuditLog = async ({
  actor,
  actorId,
  action,
  entityType,
  entityId = null,
  entityLabel = "",
  correlationId = "",
  reason = "",
  related = {},
  changedFields = null,
  before = null,
  after = null,
  metadata = {},
}, { session = null } = {}) => {
  let actorSnapshot = actor;
  if (!actorSnapshot && actorId) {
    actorSnapshot = await User.findById(actorId).select("name role").session(session || null).lean();
  }
  const [log] = await AuditLog.create([{
    actor: actorSnapshot?._id || actorId || null,
    actorName: actorSnapshot?.name || "System",
    actorRole: actorSnapshot?.role || "system",
    action,
    entityType,
    entityId,
    entityLabel,
    correlationId,
    reason,
    related: plainValue(related) || {},
    changedFields: changedFields || auditDiff(before, after),
    before: plainValue(before),
    after: plainValue(after),
    metadata: plainValue(metadata) || {},
  }], sessionOptions(session));
  return log;
};
