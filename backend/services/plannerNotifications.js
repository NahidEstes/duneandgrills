import mongoose from "mongoose";
import PlannerTask from "../models/PlannerTask.js";
import PlannerSeries from "../models/PlannerSeries.js";
import PlannerNotificationState from "../models/PlannerNotificationState.js";
import { PlannerError, assertPlannerFields, plannerDay, shiftPlannerDay } from "./plannerRules.js";
import { ensurePlannerOccurrences, getPlannerTask } from "./plannerService.js";

export const plannerNotificationKey = task => `${new Date(task.dueAt).toISOString()}|${task.snoozedUntil ? new Date(task.snoozedUntil).toISOString() : ""}`;

export async function listPlannerNotifications(actor, now = new Date()) {
  await ensurePlannerOccurrences(shiftPlannerDay(plannerDay(now), 62));
  const [result] = await PlannerTask.aggregate([
    { $match: { deleted: false, status: { $in: ["Pending", "In Progress"] }, dueAt: { $lte: new Date(now.getTime() + 15 * 60000) }, $or: [{ snoozedUntil: null }, { snoozedUntil: { $lte: now } }] } },
    { $lookup: { from: PlannerSeries.collection.name, localField: "series", foreignField: "_id", as: "schedule" } },
    { $unwind: "$schedule" },
    { $addFields: { alertAt: { $ifNull: ["$snoozedUntil", "$dueAt"] }, notificationKey: { $concat: [{ $toString: "$dueAt" }, "|", { $ifNull: [{ $toString: "$snoozedUntil" }, ""] }] } } },
    { $match: { "schedule.paused": { $ne: true }, $expr: { $or: [{ $eq: [{ $ifNull: ["$schedule.alertsAfter", null] }, null] }, { $gte: ["$alertAt", "$schedule.alertsAfter"] }] } } },
    { $lookup: { from: PlannerNotificationState.collection.name, let: { taskId: "$_id" }, pipeline: [{ $match: { user: new mongoose.Types.ObjectId(actor._id), $expr: { $eq: ["$task", "$$taskId"] } } }, { $project: { seenKey: 1, dismissedKey: 1 } }], as: "receipt" } },
    { $addFields: { receipt: { $arrayElemAt: ["$receipt", 0] } } },
    { $match: { $expr: { $ne: [{ $ifNull: ["$receipt.dismissedKey", ""] }, "$notificationKey"] } } },
    { $addFields: { unread: { $ne: [{ $ifNull: ["$receipt.seenKey", ""] }, "$notificationKey"] } } },
    { $facet: { summary: [{ $group: { _id: null, count: { $sum: 1 }, unread: { $sum: { $cond: ["$unread", 1, 0] } } } }], data: [{ $sort: { unread: -1, dueAt: 1, _id: 1 } }, { $limit: 20 }, { $project: { title: 1, dueAt: 1, status: 1, snoozedUntil: 1, revision: 1, notificationKey: 1, unread: 1 } }] } },
  ]);
  return { data: result?.data || [], count: result?.summary[0]?.count || 0, unread: result?.summary[0]?.unread || 0, now };
}

export async function acknowledgePlannerNotification(id, body, actor) {
  assertPlannerFields(body, ["key", "action"]);
  if (!["read", "dismiss"].includes(body.action) || typeof body.key !== "string" || body.key.length > 100) throw new PlannerError("Invalid notification action");
  const task = await getPlannerTask(id);
  if (plannerNotificationKey(task) !== body.key) throw new PlannerError("This reminder changed. Refresh the notifications", 409);
  const filter = { user: actor._id, task: task._id }, update = { seenKey: body.key, ...(body.action === "dismiss" ? { dismissedKey: body.key } : {}) };
  try { await PlannerNotificationState.updateOne(filter, { $set: update }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; await PlannerNotificationState.updateOne(filter, { $set: update }); }
}
