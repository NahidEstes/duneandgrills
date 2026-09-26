import { statusClass, statusLabel } from "./attendanceUtils.js";

export default function AttendanceStatusBadge({ status, lateMinutes = 0 }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{statusLabel(status)}{status === "late" && Number(lateMinutes) > 0 ? ` ${lateMinutes}m` : ""}</span>;
}
