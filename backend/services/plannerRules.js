export const PLANNER_CATEGORIES = ["Daily Routine", "Kitchen", "Cleaning & Maintenance", "Inventory", "Purchasing", "Finance Reminder", "Staff", "Other"];
export const PLANNER_STATUSES = ["Pending", "In Progress", "Done", "Cancelled"];
export const PLANNER_REPEATS = ["none", "daily", "weekly", "monthly", "quarterly", "yearly", "custom"];
export const PLANNER_DAY_MS = 86400000;
export class PlannerError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const plannerDay = (now = new Date()) => new Date(new Date(now).getTime() + 10800000).toISOString().slice(0, 10);
export const plannerDate = value => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "2020-01-01" || value > "2100-12-31") throw new PlannerError("Choose a valid date between 2020 and 2100");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new PlannerError("Invalid due date");
  return date;
};
export const shiftPlannerDay = (day, days) => new Date(plannerDate(day).getTime() + days * PLANNER_DAY_MS).toISOString().slice(0, 10);
export const plannerDueAt = (day, time) => {
  plannerDate(day);
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new PlannerError("Choose a valid time in Riyadh time");
  return new Date(`${day}T${time}:00+03:00`);
};
export function normalizePlannerRepeat(repeat, options = {}, dueDate) {
  if (!PLANNER_REPEATS.includes(repeat)) throw new PlannerError("Invalid repeat option");
  if (repeat !== "custom") return null;
  assertPlannerFields(options, ["unit", "interval", "weekdays"]);
  if (!["weeks", "months"].includes(options.unit) || !Number.isInteger(options.interval) || options.interval < 1 || options.interval > (options.unit === "weeks" ? 52 : 24)) throw new PlannerError("Choose a repeat interval of 1–52 weeks or 1–24 months");
  const weekdays = options.weekdays ?? [];
  if (!Array.isArray(weekdays) || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6) || new Set(weekdays).size !== weekdays.length || (options.unit === "weeks" && !weekdays.length) || (options.unit === "months" && weekdays.length)) throw new PlannerError("Choose valid repeat weekdays");
  if (options.unit === "weeks" && dueDate && !weekdays.includes(plannerDate(dueDate).getUTCDay())) throw new PlannerError("The due date must fall on one of the selected weekdays");
  return { unit: options.unit, interval: options.interval, weekdays: [...weekdays].sort() };
}
export const nextPlannerDay = (day, repeat, anchorDay = Number(day.slice(8)), options = null, anchorDate = day) => {
  if (repeat === "none") return null;
  if (repeat === "daily" || repeat === "weekly") return shiftPlannerDay(day, repeat === "daily" ? 1 : 7);
  if (repeat === "custom" && options?.unit === "weeks") {
    const anchor = plannerDate(anchorDate), sunday = anchor.getTime() - anchor.getUTCDay() * PLANNER_DAY_MS;
    for (let step = 1; step <= options.interval * 7 + 7; step++) {
      const next = plannerDate(shiftPlannerDay(day, step));
      if (options.weekdays.includes(next.getUTCDay()) && Math.floor((next.getTime() - sunday) / (7 * PLANNER_DAY_MS)) % options.interval === 0) return next.toISOString().slice(0, 10);
    }
    throw new PlannerError("Invalid weekly schedule");
  }
  const interval = repeat === "monthly" ? 1 : repeat === "quarterly" ? 3 : repeat === "yearly" ? 12 : repeat === "custom" && options?.unit === "months" ? options.interval : null;
  if (!interval) throw new PlannerError("Invalid repeat option");
  const date = plannerDate(day), year = date.getUTCFullYear(), month = date.getUTCMonth() + interval;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchorDay, last))).toISOString().slice(0, 10);
};
export const plannerText = (value, label, max, required = false) => {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new PlannerError(`${label} must contain ${required ? "1" : "0"}–${max} characters`);
  return value.trim();
};
export const assertPlannerObject = value => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlannerError("Planner details must be an object");
};
export const assertPlannerFields = (body, allowed) => {
  assertPlannerObject(body);
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new PlannerError("Unsupported Planner field. Reminders cannot change business records");
};
