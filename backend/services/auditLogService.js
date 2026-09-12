import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";

const sessionOptions = (session) => (session ? { session } : {});

const plainValue = (value) => {
  if (value == null) return null;
  if (typeof value.toObject === "function") return value.toObject({ depopulate: true });
  return value;
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
    before: plainValue(before),
    after: plainValue(after),
    metadata: plainValue(metadata) || {},
  }], sessionOptions(session));
  return log;
};
