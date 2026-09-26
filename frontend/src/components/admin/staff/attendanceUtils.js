export const ATTENDANCE_STATUSES = Object.freeze([
  { value: "all", label: "All statuses" },
  { value: "on_time", label: "On Time" },
  { value: "checked_in", label: "Checked In" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "on_leave", label: "On Leave" },
  { value: "scheduled", label: "Not Started" },
]);

export const statusLabel = (status) => ({
  on_time: "On Time",
  checked_in: "Checked In",
  late: "Late",
  absent: "Absent",
  on_leave: "On Leave",
  scheduled: "Not Started",
  completed: "Completed",
}[status] || "Unknown");

export const statusClass = (status) => ({
  on_time: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  checked_in: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  late: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  absent: "border-red-500/25 bg-red-500/10 text-red-300",
  on_leave: "border-blue-500/25 bg-blue-500/10 text-blue-300",
  scheduled: "border-white/10 bg-white/[0.04] text-neutral-400",
  completed: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
}[status] || "border-white/10 bg-white/[0.04] text-neutral-400");

export const toRiyadhDateTimeInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
};

export const fromRiyadhDateTimeInput = (value) => value ? `${value}:00+03:00` : null;

export const previousDateKey = (dateKey) => {
  const date = new Date(`${dateKey}T00:00:00+03:00`);
  return new Date(date.getTime() - 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
};
