"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock3, LoaderCircle, Plane, Search, UserCheck, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { fetchAttendance, fetchShifts } from "@/src/api/api.js";
import { useAuth } from "@/src/context/AuthContext.jsx";
import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import AttendanceDetailsDialog from "./AttendanceDetailsDialog.jsx";
import AttendanceStatusBadge from "./AttendanceStatusBadge.jsx";
import MonthlyAttendanceReport from "./MonthlyAttendanceReport.jsx";
import { ATTENDANCE_STATUSES, previousDateKey } from "./attendanceUtils.js";
import { formatMinutes, formatRiyadhTime, inputClass, panelClass, todayRiyadh } from "./staffUi.jsx";

const summaryConfig = [
  { key: "present", label: "Present", icon: UserCheck, color: "emerald", note: "Clocked in on time" },
  { key: "late", label: "Late", icon: Clock3, color: "amber", note: "After the grace period" },
  { key: "absent", label: "Absent", icon: UserRoundX, color: "red", note: "Shift started, no clock-in" },
  { key: "onLeave", label: "On Leave", icon: Plane, color: "sky", note: "Approved leave" },
];
const summaryTone = { emerald: "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300", amber: "border-amber-500/20 bg-amber-500/[0.06] text-amber-300", red: "border-red-500/20 bg-red-500/[0.06] text-red-300", sky: "border-sky-500/20 bg-sky-500/[0.06] text-sky-300" };

export default function AttendanceDashboard() {
  const { user } = useAuth();
  const canManage = user?.role === "admin";
  const today = todayRiyadh();
  const [filters, setFilters] = useState({ search: "", from: today, to: today, shift: "all", status: "all" });
  const [preset, setPreset] = useState("today");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ present: 0, late: 0, absent: 0, onLeave: 0 });
  const [activity, setActivity] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [response, shiftRows] = await Promise.all([fetchAttendance(filters), fetchShifts()]);
      setRows(response.data);
      setSummary(response.summary);
      setActivity(response.activity);
      setShifts(shiftRows);
    } catch (error) { toast.error(error.response?.data?.message || "Unable to load attendance."); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { const timeout = setTimeout(load, filters.search ? 250 : 0); return () => clearTimeout(timeout); }, [filters.search, load]);

  const choosePreset = (value) => {
    setPreset(value);
    if (value === "today") setFilters((current) => ({ ...current, from: today, to: today }));
    if (value === "yesterday") { const yesterday = previousDateKey(today); setFilters((current) => ({ ...current, from: yesterday, to: yesterday })); }
  };

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summaryConfig.map(({ key, label, icon: Icon, color, note }) => <article key={key} className={`rounded-2xl border p-4 ${summaryTone[color]}`}><div className="flex items-start justify-between"><div><p className="text-sm text-neutral-300">{label}</p><p className="mt-2 text-3xl font-semibold text-white">{summary[key] || 0}</p></div><span className="grid h-11 w-11 place-items-center rounded-full bg-current/10"><Icon className="h-5 w-5" /></span></div><p className="mt-2 text-xs text-neutral-500">{note}</p></article>)}</div>

    <section className={`${panelClass} p-3`} aria-label="Attendance filters"><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_150px_180px_180px_170px_170px]">
      <label className="relative"><span className="sr-only">Search staff</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" /><input type="search" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search staff by name or ID…" className={`${inputClass} pl-9`} /></label>
      <DarkSelect value={preset} onChange={(event) => choosePreset(event.target.value)} className={inputClass} aria-label="Date preset"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="custom">Custom date</option><option value="range">Date range</option></DarkSelect>
      <DarkDatePicker value={filters.from} onChange={(event) => { setPreset(preset === "range" ? "range" : "custom"); setFilters({ ...filters, from: event.target.value, ...(preset === "range" ? {} : { to: event.target.value }) }); }} className={inputClass} aria-label="Attendance from date" />
      <DarkDatePicker value={filters.to} min={filters.from} onChange={(event) => { setPreset("range"); setFilters({ ...filters, to: event.target.value }); }} className={inputClass} aria-label="Attendance to date" />
      <DarkSelect value={filters.shift} onChange={(event) => setFilters({ ...filters, shift: event.target.value })} className={inputClass} aria-label="Shift filter"><option value="all">All shifts</option>{shifts.map((shift) => <option key={shift._id} value={shift._id}>{shift.name}</option>)}</DarkSelect>
      <DarkSelect value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className={inputClass} aria-label="Status filter">{ATTENDANCE_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</DarkSelect>
    </div></section>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
      <section className={`${panelClass} overflow-hidden`}><div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3"><div><h2 className="font-semibold text-white">Attendance Records</h2><p className="mt-1 text-xs text-neutral-500">Times shown in Asia/Riyadh.</p></div>{loading && <LoaderCircle className="h-5 w-5 animate-spin text-dune-amber" />}</div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-white/[0.07] text-xs text-neutral-500"><tr><th className="px-4 py-3">Staff</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Shift</th><th className="px-3 py-3">Clock In</th><th className="px-3 py-3">Clock Out</th><th className="px-3 py-3">Worked</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-white/[0.055]">{rows.map((row, index) => <tr key={row._id || `${row.staff?._id}-${row.date}-${index}`} onClick={() => row._id && setSelectedId(row._id)} className={row._id ? "cursor-pointer hover:bg-white/[0.03]" : ""}><td className="px-4 py-3"><span className="font-medium text-white">{row.staff?.name}</span><span className="block text-xs text-neutral-500">{row.staff?.employeeId || row.staff?.role}</span></td><td className="px-3 py-3 text-neutral-400">{row.date}</td><td className="px-3 py-3"><span className="text-neutral-300">{row.shiftName}</span><span className="block text-xs text-neutral-600">{formatRiyadhTime(row.scheduledStart)}–{formatRiyadhTime(row.scheduledEnd)}</span></td><td className="px-3 py-3 tabular-nums text-neutral-300">{formatRiyadhTime(row.clockIn)}</td><td className="px-3 py-3 tabular-nums text-neutral-300">{formatRiyadhTime(row.clockOut)}</td><td className="px-3 py-3 text-neutral-300">{formatMinutes(row.totalWorkedMinutes)}</td><td className="px-4 py-3"><AttendanceStatusBadge status={row.displayStatus} lateMinutes={row.lateMinutes} /></td></tr>)}</tbody></table></div>{!loading && !rows.length && <div className="grid min-h-52 place-items-center px-5 text-center"><div><CalendarDays className="mx-auto h-8 w-8 text-neutral-700" /><p className="mt-3 text-sm text-neutral-500">No attendance records match these filters.</p></div></div>}</section>

      <aside className={`${panelClass} overflow-hidden`}><div className="border-b border-white/[0.07] p-4"><h2 className="font-semibold text-white">Today&apos;s Activity</h2><p className="mt-1 text-xs text-neutral-500">Real clock events for the selected range</p></div><div className="max-h-[510px] space-y-1 overflow-y-auto p-3">{activity.map((event) => <article key={event.id} className="flex gap-3 rounded-xl p-2.5 hover:bg-white/[0.025]"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${event.type === "late" ? "bg-amber-400" : event.type === "clock_out" ? "bg-sky-400" : "bg-emerald-400"}`} /><div className="min-w-0 flex-1"><p className="text-sm text-neutral-300"><span className="font-medium text-white">{event.staffName}</span> {event.type === "clock_out" ? "clocked out" : event.type === "late" ? "clocked in late" : "clocked in"}</p><p className="mt-1 text-xs text-neutral-600">{formatRiyadhTime(event.at)}{event.lateMinutes ? ` · ${event.lateMinutes}m late` : ""}</p></div></article>)}{!activity.length && <p className="px-3 py-10 text-center text-sm text-neutral-600">No clock activity yet.</p>}</div></aside>
    </div>

    <MonthlyAttendanceReport />
    <AttendanceDetailsDialog recordId={selectedId} canManage={canManage} onClose={() => setSelectedId(null)} onChanged={load} />
  </div>;
}
