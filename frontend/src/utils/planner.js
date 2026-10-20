export const PLANNER_CATEGORIES = ["Daily Routine", "Kitchen", "Cleaning & Maintenance", "Inventory", "Purchasing", "Finance Reminder", "Staff", "Other"];
export const PLANNER_STATUSES = ["Pending", "In Progress", "Done", "Cancelled"];
export const PLANNER_REPEATS = [["none", "Does not repeat"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["yearly", "Yearly"], ["custom", "Custom"]];
export const PLANNER_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const PLANNER_TEMPLATES = [
  { id: "opening", title: "Opening Checklist", category: "Daily Routine", checklist: ["Check preparation areas", "Check equipment is ready", "Review today's reminders"] },
  { id: "closing", title: "Closing Checklist", category: "Daily Routine", checklist: ["Clean work surfaces", "Secure food storage", "Check equipment and lock up"] },
  { id: "cleaning", title: "Deep Cleaning", category: "Cleaning & Maintenance", checklist: ["Clean the grill and extraction area", "Sanitize preparation surfaces", "Clean floors and waste areas"] },
  { id: "equipment", title: "Equipment Check", category: "Cleaning & Maintenance", checklist: ["Inspect kitchen equipment", "Check fridge and freezer temperatures", "Note maintenance needs"] },
];
export const PLANNER_REFERENCE_TYPES = [["", "No linked record"], ["inventory", "Inventory item"], ["supplier", "Supplier"], ["invoice", "Supplier invoice"], ["purchase", "Purchase order"], ["staff", "Staff member"]];
export const plannerDay = (now = new Date()) => new Date(new Date(now).getTime() + 10800000).toISOString().slice(0, 10);
export const addPlannerDays = (day, days) => new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
export const plannerMonth = (day, offset = 0) => {
  const date = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
};
export const plannerCalendar = month => {
  const start = `${month.slice(0, 7)}-01`, weekday = new Date(`${start}T00:00:00Z`).getUTCDay();
  const next = plannerMonth(start, 1), count = Math.round((new Date(next) - new Date(start)) / 86400000);
  const slots = Math.ceil((weekday + count) / 7) * 7;
  return Array.from({ length: slots }, (_, index) => addPlannerDays(start, index - weekday));
};
export const plannerDateLabel = (day, options = { dateStyle: "medium" }) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", ...options }).format(new Date(`${day}T12:00:00+03:00`));
export const plannerTimeLabel = value => new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Riyadh" }).format(new Date(value));
export const plannerOverdue = (task, now = new Date()) => ["Pending", "In Progress"].includes(task.status) && new Date(task.dueAt) < new Date(now);
export const plannerRepeatOf = task => task?.series?.repeat || "none";
export const plannerRepeatLabel = task => {
  const repeat = plannerRepeatOf(task), options = task?.series?.repeatOptions;
  if (repeat !== "custom" || !options) return PLANNER_REPEATS.find(([key]) => key === repeat)?.[1] || "Does not repeat";
  return `Every ${options.interval} ${options.unit}${options.unit === "weeks" ? ` · ${options.weekdays.map(day => PLANNER_WEEKDAYS[day].slice(0, 3)).join(", ")}` : ""}`;
};
export const plannerWeek = day => addPlannerDays(day, -new Date(`${day}T12:00:00Z`).getUTCDay());
export const plannerUpdated = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("dg-planner-updated")); };
