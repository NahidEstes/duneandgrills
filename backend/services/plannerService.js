import crypto from "node:crypto";
import mongoose from "mongoose";
import PlannerTask from "../models/PlannerTask.js";
import PlannerSeries from "../models/PlannerSeries.js";
import { resolvePlannerReference, resolvePlannerResponsible } from "./plannerReferences.js";
import { PLANNER_CATEGORIES, PLANNER_REPEATS, PLANNER_STATUSES, PlannerError, assertPlannerFields, plannerDay, plannerDate, plannerDueAt, plannerText, shiftPlannerDay, nextPlannerDay } from "./plannerRules.js";

const fields = ["title", "category", "priority", "dueDate", "time", "notes", "checklist", "responsibleId", "linkedRecord", "repeat", "requestId", "revision", "scope", "status"];
const actorOf = actor => ({ id: actor._id, name: actor.name });
const event = (action, actor) => ({ action, actor: actorOf(actor), at: new Date() });
const activeStatuses = ["Pending", "In Progress"];
const validTaskId = id => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const requestIdentity = (body, actor) => {
  if (typeof body.requestId !== "string" || !/^[A-Za-z0-9_-]{16,120}$/.test(body.requestId)) throw new PlannerError("A valid Planner request ID is required");
  return { requestKey: `${actor._id}:${body.requestId}`, requestHash: crypto.createHash("sha256").update(JSON.stringify(stable(body))).digest("hex") };
};
// Only these two Planner collections are ever written in this service.
async function transaction(work) {
  const session = await mongoose.startSession();
  try { let value; await session.withTransaction(async () => { value = await work(session); }); return value; }
  catch (error) { if (error.code === 20) throw new PlannerError("Planner is temporarily unavailable: database transactions are required", 503); throw error; }
  finally { await session.endSession(); }
}
async function normalize(body, current = null) {
  assertPlannerFields(body, fields);
  if (!PLANNER_CATEGORIES.includes(body.category) || !["Normal", "High"].includes(body.priority) || !PLANNER_REPEATS.includes(body.repeat)) throw new PlannerError("Choose a valid category, priority and repeat option");
  const dueAt = plannerDueAt(body.dueDate, body.time);
  if (body.dueDate > shiftPlannerDay(plannerDay(), 730)) throw new PlannerError("Choose a due date within the next two years");
  if (!Array.isArray(body.checklist) || body.checklist.length > 30) throw new PlannerError("Use up to 30 checklist items");
  const checklist = body.checklist.map(row => {
    if (!row || typeof row !== "object" || Object.keys(row).some(key => !["text", "done"].includes(key)) || typeof row.done !== "boolean") throw new PlannerError("Invalid checklist item");
    return { text: plannerText(row.text, "Checklist item", 200, true), done: row.done };
  });
  const linkedRecord = await resolvePlannerReference(body.linkedRecord, current?.linkedRecord);
  const responsible = await resolvePlannerResponsible(body.responsibleId, current?.responsible);
  return { dueAt, repeat: body.repeat, template: { title: plannerText(body.title, "Task title", 160, true), category: body.category, priority: body.priority, dueDate: body.dueDate, time: body.time, notes: plannerText(body.notes ?? "", "Notes", 2000), checklist, linkedRecord, responsible } };
}
async function replay(identity, session = null) {
  const previous = await PlannerSeries.findOne({ requestKey: identity.requestKey }).session(session);
  if (previous && previous.requestHash !== identity.requestHash) throw new PlannerError("This Planner request was already used with different details. Refresh before saving", 409);
  return previous;
}
async function generateBatch(seriesId, through, session) {
  const series = await PlannerSeries.findOneAndUpdate({ _id: seriesId, nextOn: { $ne: null, $lte: through } }, { $inc: { revision: 1 } }, { new: true, session });
  if (!series) return;
  const days = []; let next = series.nextOn;
  while (next && next <= through && (!series.endBefore || next < series.endBefore) && days.length < 500) {
    days.push(next); next = nextPlannerDay(next, series.repeat, series.anchorDay);
  }
  if (series.endBefore && next >= series.endBefore) next = null;
  const existing = await PlannerTask.find({ groupId: series.groupId, scheduledOn: { $in: days }, $or: [{ deleted: false }, { deletionKind: "single" }] }).select("scheduledOn").session(session).lean();
  const occupied = new Set(existing.map(row => row.scheduledOn));
  const template = series.template.toObject();
  const rows = days.filter(day => !occupied.has(day)).map(day => ({ ...template, dueDate: day, checklist: template.checklist.map(row => ({ text: row.text, done: day === template.dueDate ? row.done : false })), dueAt: plannerDueAt(day, template.time), series: series._id, groupId: series.groupId, scheduledOn: day, createdBy: series.createdBy, updatedBy: series.createdBy, history: [{ action: "Reminder created", actor: series.createdBy, at: new Date() }] }));
  if (rows.length) await PlannerTask.insertMany(rows, { session });
  series.nextOn = next;
  await series.save({ session });
}
export async function ensurePlannerOccurrences(through) {
  plannerDate(through);
  if (through > shiftPlannerDay(plannerDay(), 770)) throw new PlannerError("Calendar supports planning up to two years ahead");
  for (;;) {
    const pending = await PlannerSeries.findOne({ nextOn: { $ne: null, $lte: through } }).select("_id").lean();
    if (!pending) break;
    await transaction(session => generateBatch(pending._id, through, session));
  }
}
async function addSeries(normalized, identity, groupId, actor, session) {
  const [series] = await PlannerSeries.create([{ ...identity, groupId, template: normalized.template, repeat: normalized.repeat, anchorDay: Number(normalized.template.dueDate.slice(8)), nextOn: normalized.template.dueDate, createdBy: actorOf(actor) }], { session });
  await generateBatch(series._id, normalized.template.dueDate, session);
  return series;
}
export async function createPlannerTask(body, actor) {
  assertPlannerFields(body, fields.filter(field => !["scope", "revision", "status"].includes(field)));
  const identity = requestIdentity(body, actor);
  if (await replay(identity)) return { duplicate: true };
  const normalized = await normalize(body);
  try {
    await transaction(async session => {
      if (await replay(identity, session)) return;
      await addSeries(normalized, identity, new mongoose.Types.ObjectId(), actor, session);
    });
  } catch (error) { if (error.code === 11000 && await replay(identity)) return { duplicate: true }; throw error; }
  return { duplicate: false };
}
export async function getPlannerTask(id, session = null) {
  if (!validTaskId(id)) throw new PlannerError("Reminder not found", 404);
  const task = await PlannerTask.findOne({ _id: id, deleted: false }).session(session);
  if (!task) throw new PlannerError("Reminder not found", 404);
  return task;
}
function checkRevision(body, task) {
  if (!Number.isInteger(body.revision) || body.revision !== task.revision) throw new PlannerError("This reminder changed. Refresh before saving", 409);
}
export async function editPlannerTask(id, body, actor) {
  assertPlannerFields(body, fields);
  if (body.scope === "future" && await replay(requestIdentity(body, actor))) return;
  const current = await getPlannerTask(id);
  checkRevision(body, current);
  const normalized = await normalize(body, current);
  const series = await PlannerSeries.findById(current.series);
  if (body.scope === "future") {
    const identity = requestIdentity(body, actor);
    if (await replay(identity)) return;
    await transaction(async session => {
      if (await replay(identity, session)) return;
      // Lock this series before its occurrences, matching generation lock order.
      const locked = await PlannerSeries.findOneAndUpdate({ _id: series._id }, { $inc: { revision: 1 } }, { new: true, session });
      const task = await getPlannerTask(id, session); checkRevision(body, task);
      const cutoff = task.scheduledOn;
      if (locked.endBefore && cutoff >= locked.endBefore) throw new PlannerError("This repeat schedule changed. Refresh before editing future reminders", 409);
      if (normalized.template.dueDate < cutoff) throw new PlannerError("Future reminders cannot start before the selected occurrence");
      locked.endBefore = cutoff;
      if (locked.nextOn && locked.nextOn >= cutoff) locked.nextOn = null;
      await locked.save({ session });
      await PlannerTask.updateMany({ series: locked._id, scheduledOn: { $gte: cutoff }, status: { $in: activeStatuses }, deleted: false }, { $set: { deleted: true, deletionKind: "reschedule", updatedBy: actorOf(actor) }, $inc: { revision: 1 }, $push: { history: { $each: [event("Future schedule replaced", actor)], $slice: -100 } } }, { session });
      const freshTemplate = { ...normalized, template: { ...normalized.template, checklist: normalized.template.checklist.map(row => ({ text: row.text, done: false })) } };
      await addSeries(freshTemplate, identity, locked.groupId, actor, session);
    });
    return;
  }
  if (body.scope !== "occurrence") throw new PlannerError("Choose this occurrence or this and future reminders");
  if (normalized.repeat !== series.repeat) throw new PlannerError("Choose this and future reminders to change repetition");
  const status = body.status ?? current.status;
  if (!PLANNER_STATUSES.includes(status)) throw new PlannerError("Invalid reminder status");
  const updated = await PlannerTask.findOneAndUpdate({ _id: id, revision: body.revision, deleted: false }, { $set: { ...normalized.template, dueAt: normalized.dueAt, status, completedAt: status === "Done" ? current.completedAt || new Date() : null, updatedBy: actorOf(actor) }, $inc: { revision: 1 }, $push: { history: { $each: [event("Reminder edited", actor)], $slice: -100 } } }, { new: true, runValidators: true });
  if (!updated) throw new PlannerError("This reminder changed. Refresh before saving", 409);
}
export async function changePlannerTask(id, body, actor, remove = false) {
  assertPlannerFields(body, remove ? ["revision"] : ["revision", "status", "checklist"]);
  const task = await getPlannerTask(id); checkRevision(body, task);
  const changes = { updatedBy: actorOf(actor) };
  if (remove) Object.assign(changes, { deleted: true, deletionKind: "single" });
  else {
    if (body.status !== undefined) {
      if (!PLANNER_STATUSES.includes(body.status)) throw new PlannerError("Invalid reminder status");
      Object.assign(changes, { status: body.status, completedAt: body.status === "Done" ? task.completedAt || new Date() : null });
    }
    if (body.checklist !== undefined) {
      if (!Array.isArray(body.checklist) || body.checklist.length !== task.checklist.length || body.checklist.some(done => typeof done !== "boolean")) throw new PlannerError("Invalid checklist update");
      changes.checklist = task.checklist.map((row, index) => ({ text: row.text, done: body.checklist[index] }));
    }
  }
  const updated = await PlannerTask.findOneAndUpdate({ _id: id, revision: body.revision, deleted: false }, { $set: changes, $inc: { revision: 1 }, $push: { history: { $each: [event(remove ? "Reminder deleted" : "Progress updated", actor)], $slice: -100 } } }, { new: true, runValidators: true });
  if (!updated) throw new PlannerError("This reminder changed. Refresh before updating", 409);
  return updated;
}
export async function listPlanner(query, now = new Date()) {
  const today = plannerDay(now), tomorrow = shiftPlannerDay(today, 1);
  const start = plannerDueAt(today, "00:00"), end = plannerDueAt(tomorrow, "00:00");
  const calendar = query.view === "calendar";
  let calendarFilter;
  if (calendar) {
    const from = plannerDate(query.from), to = plannerDate(query.to);
    if (to < from || to - from > 42 * 86400000) throw new PlannerError("Choose a calendar range of up to 42 days");
    calendarFilter = { dueAt: { $gte: plannerDueAt(query.from, "00:00"), $lt: plannerDueAt(shiftPlannerDay(query.to, 1), "00:00") } };
  }
  await ensurePlannerOccurrences(calendar && query.to > shiftPlannerDay(today, 62) ? query.to : shiftPlannerDay(today, 62));
  const base = { deleted: false };
  const todayFilter = { ...base, status: { $ne: "Cancelled" }, dueAt: { $gte: start, $lt: end } };
  const overdueFilter = { ...base, status: { $in: activeStatuses }, dueAt: { $lt: now } };
  const completedFilter = { ...base, status: "Done" };
  const filters = { today: todayFilter, overdue: overdueFilter, completed: completedFilter, upcoming: { ...base, status: { $in: activeStatuses }, dueAt: { $gte: end } } };
  if (!calendar && !Object.hasOwn(filters, query.filter || "today")) throw new PlannerError("Invalid reminder filter");
  const filter = calendar ? { ...base, ...calendarFilter } : filters[query.filter || "today"];
  const page = Math.max(1, parseInt(query.page, 10) || 1), limit = calendar ? 1000 : 20;
  const [rows, total, todayCount, overdue, completed, comingUp] = await Promise.all([
    PlannerTask.find(filter).populate("series", "repeat endBefore").sort({ dueAt: 1, _id: 1 }).skip(calendar ? 0 : (page - 1) * limit).limit(limit).lean(), PlannerTask.countDocuments(filter), PlannerTask.countDocuments(todayFilter), PlannerTask.countDocuments(overdueFilter), PlannerTask.countDocuments(completedFilter),
    PlannerTask.find(filters.upcoming).sort({ dueAt: 1, _id: 1 }).limit(3).lean(),
  ]);
  return { data: rows, summary: { today: todayCount, overdue, completed }, comingUp, now, today, timezone: "Asia/Riyadh", pagination: { page: calendar ? 1 : page, total, pages: Math.ceil(total / limit), truncated: calendar && total > limit } };
}
