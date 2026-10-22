import mongoose from "mongoose";
import PlannerTask from "../models/PlannerTask.js";
import { ensurePlannerOccurrences } from "./plannerService.js";
import { PLANNER_CATEGORIES, PlannerError, plannerDay, plannerDate, plannerDueAt, plannerText, shiftPlannerDay } from "./plannerRules.js";

const objectId = value => {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) throw new PlannerError("Choose a valid person");
  return new mongoose.Types.ObjectId(value);
};
export function plannerInsightRange(query, now = new Date()) {
  const today = plannerDay(now), period = query.period || "week";
  let from, to;
  if (period === "all") return { period, from: null, to: null };
  if (period === "today") from = to = today;
  else if (period === "week") { from = shiftPlannerDay(today, -plannerDate(today).getUTCDay()); to = shiftPlannerDay(from, 6); }
  else if (period === "month") { from = today.slice(0, 7) + "-01"; to = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10); }
  else if (period === "custom") { plannerDate(query.from); plannerDate(query.to); from = query.from; to = query.to; }
  else throw new PlannerError("Choose a valid period");
  if (to < from) throw new PlannerError("End date must be on or after start date");
  return { period, from, to };
}

export async function plannerInsightPipeline(query, now = new Date()) {
  const mode = query.mode || "history";
  if (!["history", "people"].includes(mode)) throw new PlannerError("Choose History or People");
  const range = plannerInsightRange(query, now);
  // History reads existing completions only. People prepares due occurrences,
  // using the same horizon as the existing Planner, never business services.
  if (mode === "people") await ensurePlannerOccurrences(range.to && range.to > shiftPlannerDay(plannerDay(now), 62) ? range.to : shiftPlannerDay(plannerDay(now), 62));
  const pipeline = [
    { $match: { deleted: false, status: mode === "history" ? "Done" : { $in: ["Pending", "In Progress", "Done"] } } },
    { $set: {
      reportTitle: { $ifNull: ["$completion.title", "$title"] },
      reportCategory: { $ifNull: ["$completion.category", "$category"] },
      reportDueAt: { $ifNull: ["$completion.dueAt", "$dueAt"] },
      reportResponsible: { $cond: [{ $ne: [{ $ifNull: ["$completion", null] }, null] }, "$completion.responsible", "$responsible"] },
      timing: { $cond: [{ $and: [{ $ne: [{ $ifNull: ["$completion.at", null] }, null] }, { $ne: [{ $ifNull: ["$completion.dueAt", null] }, null] }] }, { $cond: [{ $lte: ["$completion.at", "$completion.dueAt"] }, "On time", "Late"] }, "Unavailable"] },
    } },
  ];
  const match = {};
  if (range.from) match[mode === "history" ? "completedAt" : "reportDueAt"] = { $gte: plannerDueAt(range.from, "00:00"), $lt: plannerDueAt(shiftPlannerDay(range.to, 1), "00:00") };
  if (query.category) { if (!PLANNER_CATEGORIES.includes(query.category)) throw new PlannerError("Choose a valid category"); match.reportCategory = query.category; }
  if (query.search) {
    const literal = plannerText(query.search, "Search", 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    match.$or = ["reportTitle", "reportResponsible.name", "completion.by.name", "completion.note"].map(key => ({ [key]: { $regex: literal, $options: "i" } }));
  }
  pipeline.push({ $match: match });
  const optionsPipeline = [...pipeline];
  if (query.responsible) pipeline.push({ $match: { "reportResponsible.id": query.responsible === "unassigned" ? null : objectId(query.responsible) } });
  if (query.completedBy) pipeline.push({ $match: { "completion.by.id": query.completedBy === "unrecorded" ? null : objectId(query.completedBy) } });
  return { mode, range, pipeline, optionsPipeline };
}

const peopleGroup = now => [
  { $group: {
    _id: { $ifNull: ["$reportResponsible.id", null] },
    name: { $max: { $ifNull: ["$reportResponsible.name", "Unassigned"] } },
    assigned: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "Done"] }, 1, 0] } },
    pending: { $sum: { $cond: [{ $and: [{ $ne: ["$status", "Done"] }, { $gte: ["$reportDueAt", now] }] }, 1, 0] } },
    overdue: { $sum: { $cond: [{ $and: [{ $ne: ["$status", "Done"] }, { $lt: ["$reportDueAt", now] }] }, 1, 0] } },
  } }, { $sort: { name: 1, _id: 1 } },
];
const taskProjection = { title: 1, status: 1, completedAt: 1, completion: 1, reportTitle: 1, reportCategory: 1, reportResponsible: 1, reportDueAt: 1, timing: 1, checklist: 1 };

export async function listPlannerInsights(query, now = new Date()) {
  const { mode, range, pipeline, optionsPipeline } = await plannerInsightPipeline(query, now);
  const page = Math.max(1, Math.min(100000, parseInt(query.page, 10) || 1)), limit = 20;
  const rowPipeline = mode === "people" ? peopleGroup(now) : [{ $sort: { completedAt: -1, _id: -1 } }, { $project: taskProjection }];
  const [result, options] = await Promise.all([
    PlannerTask.aggregate([...pipeline, { $facet: {
      rows: [...rowPipeline, { $skip: (page - 1) * limit }, { $limit: limit }],
      total: [...(mode === "people" ? peopleGroup(now) : []), { $count: "count" }],
      summary: mode === "people" ? [...peopleGroup(now), { $group: { _id: null, assigned: { $sum: "$assigned" }, completed: { $sum: "$completed" }, pending: { $sum: "$pending" }, overdue: { $sum: "$overdue" } } }] : [{ $group: { _id: null, completed: { $sum: 1 }, onTime: { $sum: { $cond: [{ $eq: ["$timing", "On time"] }, 1, 0] } }, late: { $sum: { $cond: [{ $eq: ["$timing", "Late"] }, 1, 0] } }, unavailable: { $sum: { $cond: [{ $eq: ["$timing", "Unavailable"] }, 1, 0] } } } }],
    } }]),
    PlannerTask.aggregate([...optionsPipeline, { $group: { _id: null, responsible: { $addToSet: "$reportResponsible" }, completedBy: { $addToSet: "$completion.by" } } }]),
  ]);
  const total = result[0].total[0]?.count || 0;
  return { data: result[0].rows, summary: { assigned: 0, completed: 0, pending: 0, overdue: 0, onTime: 0, late: 0, unavailable: 0, ...result[0].summary[0] }, options: { responsible: (options[0]?.responsible || []).filter(row => row?.id), completedBy: (options[0]?.completedBy || []).filter(row => row?.id) }, pagination: { page, pages: Math.ceil(total / limit), total }, range, now, timezone: "Asia/Riyadh" };
}

export async function listPlannerPersonTasks(query, now = new Date()) {
  const { range, pipeline } = await plannerInsightPipeline({ ...query, mode: "people" }, now);
  if (!query.responsible) throw new PlannerError("Choose a responsible person");
  const page = Math.max(1, Math.min(100000, parseInt(query.page, 10) || 1));
  const [result] = await PlannerTask.aggregate([...pipeline, { $facet: { rows: [{ $sort: { reportDueAt: -1, _id: -1 } }, { $skip: (page - 1) * 20 }, { $limit: 20 }, { $project: taskProjection }], total: [{ $count: "count" }] } }]);
  const total = result.total[0]?.count || 0;
  return { data: result.rows, pagination: { page, pages: Math.ceil(total / 20), total }, range, now };
}

export const plannerCsvCell = value => {
  let text = String(value ?? "");
  if (/^[\s\uFEFF]*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
};
const timestamp = value => value ? new Date(new Date(value).getTime() + 10800000).toISOString().replace("T", " ").slice(0, 19) + " Riyadh" : "Not recorded";
export async function exportPlannerInsights(query, now = new Date()) {
  const { mode, pipeline } = await plannerInsightPipeline(query, now);
  const rows = await PlannerTask.aggregate([...pipeline, ...(mode === "people" ? peopleGroup(now) : [{ $sort: { completedAt: -1, _id: -1 } }, { $project: taskProjection }]), { $limit: 10001 }]);
  if (rows.length > 10000) throw new PlannerError("More than 10,000 records match. Narrow the filters before exporting; no partial export was created.", 422);
  const headers = mode === "people" ? ["Responsible person", "Assigned", "Completed", "Pending", "Overdue"] : ["Task", "Category", "Responsible person", "Assignment basis", "Marked done by", "Completed at", "Due at completion", "Timing", "Checklist at completion", "Completion note"];
  const values = rows.map(row => mode === "people" ? [row.name, row.assigned, row.completed, row.pending, row.overdue] : [row.reportTitle, row.reportCategory, row.reportResponsible?.name || "Unassigned", row.completion ? "At completion" : "Current assignment; completion not recorded", row.completion?.by?.name || "Not recorded", timestamp(row.completedAt), timestamp(row.completion?.dueAt), row.timing, row.completion ? `${row.completion.checklist.filter(item => item.done).length} of ${row.completion.checklist.length}` : "Not recorded", row.completion ? row.completion.note || "No note added" : "Not recorded"]);
  return "\uFEFF" + [headers, ...values].map(row => row.map(plannerCsvCell).join(",")).join("\r\n") + "\r\n";
}
