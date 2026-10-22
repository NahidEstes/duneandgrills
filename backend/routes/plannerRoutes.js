import express from "express";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";
import { rateLimit } from "../middleware/security.js";
import { PLANNER_CATEGORIES, PLANNER_REPEATS, PLANNER_STATUSES } from "../services/plannerRules.js";
import { changePlannerTask, createPlannerTask, editPlannerTask, getPlannerTask, listPlanner, snoozePlannerTask, undoPlannerChange, changePlannerSchedule } from "../services/plannerService.js";
import { listPlannerNotifications, acknowledgePlannerNotification } from "../services/plannerNotifications.js";
import { plannerReferenceAvailability, searchPlannerReferences } from "../services/plannerReferences.js";
import { listPlannerInsights, listPlannerPersonTasks, exportPlannerInsights } from "../services/plannerInsights.js";

const router = express.Router();
router.use(protect, requireCapability(CAPABILITIES.ADMIN_DASHBOARD));
router.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
const action = handler => async (req, res, next) => {
  try { await handler(req, res); }
  catch (error) {
    if (["ValidationError", "CastError", "StrictModeError"].includes(error.name)) error.status = 400;
    if (error.code === 11000) return res.status(409).json({ message: "This reminder changed. Refresh before trying again" });
    next(error);
  }
};
const writeLimit = rateLimit({ windowMs: 60_000, max: 60, keyPrefix: "planner-write", identity: req => String(req.user._id) });
router.get("/config", (_req, res) => res.json({ success: true, data: { categories: PLANNER_CATEGORIES, statuses: PLANNER_STATUSES, repeats: PLANNER_REPEATS, timezone: "Asia/Riyadh" } }));
router.get("/references", action(async (req, res) => res.json({ success: true, data: await searchPlannerReferences(req.query.type, req.query.search) })));
router.get("/notifications", action(async (req, res) => res.json({ success: true, ...await listPlannerNotifications(req.user) })));
router.get("/insights", action(async (req, res) => res.json({ success: true, ...await listPlannerInsights(req.query) })));
router.get("/insights/tasks", action(async (req, res) => res.json({ success: true, ...await listPlannerPersonTasks(req.query) })));
router.get("/insights/export", action(async (req, res) => {
  const csv = await exportPlannerInsights(req.query);
  res.set("Content-Type", "text/csv; charset=utf-8").set("Content-Disposition", `attachment; filename="planner-${req.query.mode === "people" ? "people" : "history"}.csv"`).send(csv);
}));
router.get("/", action(async (req, res) => res.json({ success: true, ...await listPlanner(req.query) })));
router.post("/", writeLimit, action(async (req, res) => {
  const result = await createPlannerTask(req.body, req.user);
  res.status(result.duplicate ? 200 : 201).json({ success: true, ...result });
}));
router.get("/:id", action(async (req, res) => {
  const task = await getPlannerTask(req.params.id);
  await task.populate("series", "repeat repeatOptions endBefore paused pausedAt revision history alertsAfter");
  const data = task.toObject();
  data.linkedRecord = await plannerReferenceAvailability(data.linkedRecord);
  if (data.responsible?.id) {
    const reference = await plannerReferenceAvailability({ type: "staff", id: data.responsible.id });
    data.responsible.available = reference.available;
  }
  res.json({ success: true, data });
}));
router.patch("/:id", writeLimit, action(async (req, res) => {
  await editPlannerTask(req.params.id, req.body, req.user);
  res.json({ success: true });
}));
router.patch("/:id/progress", writeLimit, action(async (req, res) => res.json({ success: true, data: await changePlannerTask(req.params.id, req.body, req.user) })));
router.patch("/:id/snooze", writeLimit, action(async (req, res) => res.json({ success: true, data: await snoozePlannerTask(req.params.id, req.body, req.user) })));
router.post("/:id/undo", writeLimit, action(async (req, res) => res.json({ success: true, data: await undoPlannerChange(req.params.id, req.body, req.user) })));
router.patch("/:id/schedule", writeLimit, action(async (req, res) => res.json({ success: true, data: await changePlannerSchedule(req.params.id, req.body, req.user) })));
router.post("/:id/notification", writeLimit, action(async (req, res) => { await acknowledgePlannerNotification(req.params.id, req.body, req.user); res.json({ success: true }); }));
router.delete("/:id", writeLimit, action(async (req, res) => {
  await changePlannerTask(req.params.id, req.body, req.user, true);
  res.json({ success: true });
}));
export default router;
