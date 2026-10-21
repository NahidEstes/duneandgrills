import mongoose from "mongoose";
import Counter from "../models/Counter.js";
import User from "../models/User.js";

const guardKey = "staff-admin-access-guard";
const accessError = (message, status) => Object.assign(new Error(message), { status });

// Serialize role/deactivation changes across API instances, including transaction retries.
// This counter is only a lock revision; it never touches money or inventory records.
export const withStaffAccessTransaction = async (actorId, work) => {
  await Counter.updateOne({ _id: guardKey }, { $setOnInsert: { seq: 0 } }, { upsert: true });
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      await Counter.updateOne({ _id: guardKey }, { $inc: { seq: 1 } }, { session });
      if (!await User.exists({ _id: actorId, role: "admin", isActive: { $ne: false } }).session(session)) {
        throw accessError("Admin access changed. Sign in again before updating staff.", 403);
      }
      result = await work(session);
    });
    return result;
  } finally { await session.endSession(); }
};

export const assertAdminRemains = async (user, nextRole, nextActive, session) => {
  if (user.role !== "admin" || user.isActive === false || (nextRole === "admin" && nextActive)) return;
  const others = await User.countDocuments({ _id: { $ne: user._id }, role: "admin", isActive: { $ne: false } }).session(session);
  if (!others) throw accessError("The last active admin cannot be demoted or deactivated. Assign another active admin first.", 409);
};
