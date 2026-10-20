import crypto from "node:crypto";
import mongoose from "mongoose";
import PlannerTask from "../models/PlannerTask.js";
import PlannerSeries from "../models/PlannerSeries.js";
import { resolvePlannerReference, resolvePlannerResponsible } from "./plannerReferences.js";
import { PLANNER_CATEGORIES, PLANNER_REPEATS, PLANNER_STATUSES, PlannerError, assertPlannerFields, plannerDay, plannerDate, plannerDueAt, plannerText, shiftPlannerDay, nextPlannerDay, normalizePlannerRepeat } from "./plannerRules.js";

const fields = ["title", "category", "priority", "dueDate", "time", "notes", "checklist", "responsibleId", "linkedRecord", "repeat", "repeatOptions", "requestId", "revision", "scope", "status"];
const actorOf = actor => ({ id: actor._id, name: actor.name });
const event = (action, actor) => ({ action, actor: actorOf(actor), at: new Date() });
const activeStatuses = ["Pending", "In Progress"];
const validTaskId = id => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const requestIdentity = (body, actor) => {
  if (typeof body.requestId !== "string" || !/^[A-Za-z0-9_-]{16,120}$/.test(body.requestId)) throw new PlannerError("A valid Planner request ID is required");
  return { requestKey: `${actor._id}:${body.requestId}`, requestHash: crypto.createHash("sha256").update(JSON.stringify(stable(body))).digest("hex") };
};
// Only Planner collections are ever written in this service.
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
  return { dueAt, repeat: body.repeat, repeatOptions: normalizePlannerRepeat(body.repeat, body.repeatOptions ?? {}, current && body.scope === "occurrence" ? undefined : body.dueDate), template: { title: plannerText(body.title, "Task title", 160, true), category: body.category, priority: body.priority, dueDate: body.dueDate, time: body.time, notes: plannerText(body.notes ?? "", "Notes", 2000), checklist, linkedRecord, responsible } };
}
async function replay(identity, session = null) {
  const previous = await PlannerSeries.findOne({ requestKey: identity.requestKey }).session(session);
  if (previous && previous.requestHash !== identity.requestHash) throw new PlannerError("This Planner request was already used with different details. Refresh before saving", 409);
  return previous;
}
async function generateBatch(seriesId, through, session) {
  const series = await PlannerSeries.findOneAndUpdate({ _id: seriesId, paused: { $ne: true }, nextOn: { $ne: null, $lte: through } }, { $inc: { revision: 1 } }, { new: true, session });
  if (!series) return;
  const days = []; let next = series.nextOn;
  while (next && next <= through && (!series.endBefore || next < series.endBefore) && days.length < 500) {
    days.push(next); next = nextPlannerDay(next, series.repeat, series.anchorDay, series.repeatOptions, series.template.dueDate);
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
    const pending = await PlannerSeries.findOne({ paused: { $ne: true }, nextOn: { $ne: null, $lte: through } }).select("_id").lean();
    if (!pending) break;
    await transaction(session => generateBatch(pending._id, through, session));
  }
}
async function addSeries(normalized, identity, groupId, actor, session, previous = null) {
  const [series] = await PlannerSeries.create([{ ...identity, groupId, template: normalized.template, repeat: normalized.repeat, repeatOptions: normalized.repeatOptions, anchorDay: Number(normalized.template.dueDate.slice(8)), nextOn: normalized.template.dueDate, paused: previous?.paused || false, pausedAt: previous?.pausedAt || null, alertsAfter: previous?.alertsAfter || null, createdBy: actorOf(actor) }], { session });
  // Even a paused future edit creates its explicitly selected occurrence.
  if (series.paused) {
    const occupied = await PlannerTask.exists({ groupId, scheduledOn: normalized.template.dueDate, $or: [{ deleted: false }, { deletionKind: "single" }] }).session(session);
    if (!occupied) await PlannerTask.create([{ ...normalized.template, dueAt: normalized.dueAt, series: series._id, groupId, scheduledOn: normalized.template.dueDate, createdBy: actorOf(actor), updatedBy: actorOf(actor), history: [event("Reminder created", actor)] }], { session });
    series.nextOn = nextPlannerDay(series.nextOn, series.repeat, series.anchorDay, series.repeatOptions, series.template.dueDate);
    await series.save({ session });
    return series;
  }
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
      await addSeries(freshTemplate, identity, locked.groupId, actor, session, locked);
    });
    return;
  }
  if (body.scope !== "occurrence") throw new PlannerError("Choose this occurrence or this and future reminders");
  if (normalized.repeat !== series.repeat || JSON.stringify(stable(normalized.repeatOptions)) !== JSON.stringify(stable(series.repeatOptions?.toObject() ?? null))) throw new PlannerError("Choose this and future reminders to change repetition");
  const status = body.status ?? current.status;
  if (!PLANNER_STATUSES.includes(status)) throw new PlannerError("Invalid reminder status");
  const updated = await PlannerTask.findOneAndUpdate({ _id: id, revision: body.revision, deleted: false }, { $set: { ...normalized.template, dueAt: normalized.dueAt, status, completedAt: status === "Done" ? current.completedAt || new Date() : null, undo: null, ...(normalized.dueAt.getTime() !== current.dueAt.getTime() ? { snoozedUntil: null } : {}), updatedBy: actorOf(actor) }, $inc: { revision: 1 }, $push: { history: { $each: [event("Reminder edited", actor)], $slice: -100 } } }, { new: true, runValidators: true });
  if (!updated) throw new PlannerError("This reminder changed. Refresh before saving", 409);
}
export async function changePlannerTask(id, body, actor, remove = false) {
  assertPlannerFields(body, remove ? ["revision"] : ["revision", "status", "checklist"]);
  const task = await getPlannerTask(id); checkRevision(body, task);
  const changes = { updatedBy: actorOf(actor), undo: null };
  if (remove) Object.assign(changes, { deleted: true, deletionKind: "single" });
  else {
    if (body.status !== undefined) {
      if (!PLANNER_STATUSES.includes(body.status)) throw new PlannerError("Invalid reminder status");
      Object.assign(changes, { status: body.status, completedAt: body.status === "Done" ? task.completedAt || new Date() : null });
      if (["Done", "Cancelled"].includes(body.status) && task.status !== body.status) changes.undo = { token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 15000), revision: task.revision + 1, previousStatus: task.status, previousCompletedAt: task.completedAt };
    }
    if (body.checklist !== undefined) {
      if (!Array.isArray(body.checklist) || body.checklist.length !== task.checklist.length || body.checklist.some(done => typeof done !== "boolean")) throw new PlannerError("Invalid checklist update");
      changes.checklist = task.checklist.map((row, index) => ({ text: row.text, done: body.checklist[index] }));
    }
  }
  const updated = await PlannerTask.findOneAndUpdate({ _id: id, revision: body.revision, deleted: false }, { $set: changes, $inc: { revision: 1 }, $push: { history: { $each: [event(remove ? "Reminder deleted" : body.status ? `Status changed to ${body.status}` : "Checklist updated", actor)], $slice: -100 } } }, { new: true, runValidators: true });
  if (!updated) throw new PlannerError("This reminder changed. Refresh before updating", 409);
  return updated;
}
export async function listPlanner(query, now = new Date()) {
  const today = plannerDay(now), tomorrow = shiftPlannerDay(today, 1);
  const start = plannerDueAt(today, "00:00"), end = plannerDueAt(tomorrow, "00:00");
  const calendar = ["calendar", "week"].includes(query.view);
  let calendarFilter;
  if (calendar) {
    const from = plannerDate(query.from), to = plannerDate(query.to);
    if (to < from || to - from > (query.view === "week" ? 6 : 41) * 86400000) throw new PlannerError("Choose a valid calendar range (7 days for Week, up to 42 days for Month)");
    calendarFilter = { dueAt: { $gte: plannerDueAt(query.from, "00:00"), $lt: plannerDueAt(shiftPlannerDay(query.to, 1), "00:00") } };
  }
  await ensurePlannerOccurrences(calendar && query.to > shiftPlannerDay(today, 62) ? query.to : shiftPlannerDay(today, 62));
  const base = { deleted: false };
  if (query.search) {
    const search = plannerText(query.search, "Search", 100);
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    base.$or = [{ title: regex }, { notes: regex }, { "checklist.text": regex }, { "linkedRecord.label": regex }];
  }
  if (query.category) { if (!PLANNER_CATEGORIES.includes(query.category)) throw new PlannerError("Invalid category"); base.category = query.category; }
  if (query.priority) { if (!["Normal", "High"].includes(query.priority)) throw new PlannerError("Invalid priority"); base.priority = query.priority; }
  if (query.responsible) {
    if (query.responsible !== "unassigned" && !validTaskId(query.responsible)) throw new PlannerError("Invalid responsible person");
    base["responsible.id"] = query.responsible === "unassigned" ? null : query.responsible;
  }
  const todayFilter = { ...base, status: { $ne: "Cancelled" }, dueAt: { $gte: start, $lt: end } };
  const overdueFilter = { ...base, status: { $in: activeStatuses }, dueAt: { $lt: now } };
  const completedFilter = { ...base, status: "Done" };
  const pendingTodayFilter = { ...todayFilter, status: { $in: activeStatuses } };
  const completedTodayFilter = { ...completedFilter, completedAt: { $gte: start, $lt: end } };
  const filters = { all: base, today: todayFilter, pending_today: pendingTodayFilter, completed_today: completedTodayFilter, cancelled: { ...base, status: "Cancelled" }, overdue: overdueFilter, completed: completedFilter, upcoming: { ...base, status: { $in: activeStatuses }, dueAt: { $gte: end } } };
  const selected = query.filter || (calendar ? "all" : "today");
  if (!Object.hasOwn(filters, selected)) throw new PlannerError("Invalid reminder filter");
  const filter = calendar ? { $and: [filters[selected], calendarFilter] } : filters[selected];
  const sorts = { due_asc: { dueAt: 1, _id: 1 }, due_desc: { dueAt: -1, _id: -1 }, priority: { priority: 1, dueAt: 1, _id: 1 }, completed: { completedAt: -1, _id: -1 } };
  if (query.sort && !Object.hasOwn(sorts, query.sort)) throw new PlannerError("Invalid reminder sort");
  const sort = sorts[query.sort || (selected.startsWith("completed") ? "completed" : "due_asc")];
  const page = Math.max(1, Math.min(100000, parseInt(query.page, 10) || 1)), limit = calendar ? 1000 : 20;
  const [rows, total, todayCount, overdue, completed, completedToday, comingUp] = await Promise.all([
    PlannerTask.find(filter).select("-undo -snoozeRequest").populate("series", "repeat repeatOptions endBefore paused pausedAt revision alertsAfter").sort(sort).skip(calendar ? 0 : (page - 1) * limit).limit(limit).lean(), PlannerTask.countDocuments(filter), PlannerTask.countDocuments(pendingTodayFilter), PlannerTask.countDocuments(overdueFilter), PlannerTask.countDocuments(completedFilter), PlannerTask.countDocuments(completedTodayFilter),
    PlannerTask.find(filters.upcoming).sort({ dueAt: 1, _id: 1 }).limit(3).lean(),
  ]);
  return { data: rows, summary: { today: todayCount, overdue, completed, completedToday }, comingUp, now, today, timezone: "Asia/Riyadh", pagination: { page: calendar ? 1 : page, total, pages: Math.ceil(total / limit), truncated: calendar && total > limit } };
}

export async function snoozePlannerTask(id, body, actor, now = new Date()) {
  assertPlannerFields(body, ["revision", "requestId", "option", "until"]);
  const identity = requestIdentity(body, actor), task = await getPlannerTask(id);
  if (task.snoozeRequest?.key === identity.requestKey) {
    if (task.snoozeRequest.hash !== identity.requestHash) throw new PlannerError("This snooze request was already used with different details", 409);
    return task;
  }
  checkRevision(body, task);
  if (!activeStatuses.includes(task.status)) throw new PlannerError("Only active reminders can be snoozed");
  let until = null;
  if (body.option === "30m" || body.option === "1h") until = new Date(now.getTime() + (body.option === "30m" ? 30 : 60) * 60000);
  else if (body.option === "tomorrow") until = plannerDueAt(shiftPlannerDay(plannerDay(now), 1), "09:00");
  else if (body.option === "custom" && typeof body.until === "string") until = new Date(body.until);
  else if (body.option !== "clear") throw new PlannerError("Choose a snooze option");
  if (until && (!Number.isFinite(until.getTime()) || until <= now || until > new Date(now.getTime() + 730 * 86400000))) throw new PlannerError("Choose a future snooze time within two years");
  const updated = await PlannerTask.findOneAndUpdate({ _id: id, revision: task.revision, deleted: false }, { $set: { snoozedUntil: until, snoozeRequest: { key: identity.requestKey, hash: identity.requestHash }, undo: null, updatedBy: actorOf(actor) }, $inc: { revision: 1 }, $push: { history: { $each: [event(until ? `Reminder snoozed until ${until.toISOString()}` : "Snooze cleared", actor)], $slice: -100 } } }, { new: true });
  if (!updated) throw new PlannerError("This reminder changed. Refresh before snoozing", 409);
  return updated;
}

export async function undoPlannerChange(id, body, actor, now = new Date()) {
  assertPlannerFields(body, ["revision", "token"]);
  const task = await getPlannerTask(id); checkRevision(body, task);
  if (!task.undo || task.undo.token !== body.token || task.undo.revision !== task.revision || task.undo.expiresAt <= now) throw new PlannerError("Undo expired or this reminder changed. Refresh to review its status", 409);
  const updated = await PlannerTask.findOneAndUpdate({ _id: id, revision: task.revision, deleted: false, "undo.token": body.token, "undo.expiresAt": { $gt: now } }, { $set: { status: task.undo.previousStatus, completedAt: task.undo.previousCompletedAt, undo: null, updatedBy: actorOf(actor) }, $inc: { revision: 1 }, $push: { history: { $each: [event("Status change undone", actor)], $slice: -100 } } }, { new: true });
  if (!updated) throw new PlannerError("This reminder changed. Undo was not applied", 409);
  return updated;
}

export async function changePlannerSchedule(id, body, actor, now = new Date()) {
  assertPlannerFields(body, ["revision", "paused"]);
  if (!Number.isInteger(body.revision) || typeof body.paused !== "boolean") throw new PlannerError("Choose a valid schedule action");
  return transaction(async session => {
    const task = await getPlannerTask(id, session);
    const series = await PlannerSeries.findOneAndUpdate({ _id: task.series, revision: body.revision }, { $inc: { revision: 1 } }, { new: true, session });
    if (!series) throw new PlannerError("This schedule changed. Refresh before trying again", 409);
    if (series.repeat === "none" || series.endBefore) throw new PlannerError("Only a current repeating schedule can be paused or resumed");
    if (series.paused !== body.paused) {
      if (!body.paused) {
        // Already materialized tasks are kept. Never backfill missing paused dates.
        while (series.nextOn && plannerDueAt(series.nextOn, series.template.time) < now) series.nextOn = nextPlannerDay(series.nextOn, series.repeat, series.anchorDay, series.repeatOptions, series.template.dueDate);
        series.alertsAfter = now;
      }
      series.paused = body.paused; series.pausedAt = body.paused ? now : null;
      series.history.push(event(body.paused ? "Schedule paused" : "Schedule resumed; earlier alerts suppressed", actor));
      series.history = series.history.slice(-100);
    }
    await series.save({ session });
    return series;
  });
}
