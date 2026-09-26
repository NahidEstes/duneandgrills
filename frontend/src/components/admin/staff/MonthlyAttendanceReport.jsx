"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { fetchMonthlyAttendance, fetchStaffAccounts } from "@/src/api/api.js";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import { formatMinutes, inputClass, monthRiyadh, panelClass } from "./staffUi.jsx";

const monthOptions = () => {
  const current = new Date();
  return Array.from({ length: 24 }, (_, index) => {
    const valueDate = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - index, 1));
    const value = valueDate.toISOString().slice(0, 7);
    return { value, label: new Intl.DateTimeFormat("en-SA", { month: "long", year: "numeric", timeZone: "UTC" }).format(valueDate) };
  });
};

export default function MonthlyAttendanceReport() {
  const [month, setMonth] = useState(monthRiyadh());
  const [staffId, setStaffId] = useState("all");
  const [staff, setStaff] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const months = useMemo(() => monthOptions(), []);
  const load = useCallback(async () => {
    setLoading(true);
    try { const [report, people] = await Promise.all([fetchMonthlyAttendance({ month, staff: staffId }), fetchStaffAccounts()]); setRows(report.data); setStaff(people); }
    catch (error) { toast.error(error.response?.data?.message || "Unable to load monthly attendance report."); }
    finally { setLoading(false); }
  }, [month, staffId]);
  useEffect(() => { load(); }, [load]);

  return <section className={`${panelClass} overflow-hidden`}><div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-white">Monthly Staff Report</h2><p className="mt-1 text-xs text-neutral-500">Attendance totals prepared for future payroll integration.</p></div><div className="grid gap-2 sm:grid-cols-2"><DarkSelect value={month} onChange={(event) => setMonth(event.target.value)} className={inputClass}>{months.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</DarkSelect><DarkSelect value={staffId} onChange={(event) => setStaffId(event.target.value)} className={inputClass}><option value="all">All employees</option>{staff.map((person) => <option key={person._id} value={person._id}>{person.name}</option>)}</DarkSelect></div></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-white/[0.07] text-xs text-neutral-500"><tr><th className="px-4 py-3">Employee</th><th className="px-3 py-3">Present</th><th className="px-3 py-3">Late</th><th className="px-3 py-3">Absent</th><th className="px-3 py-3">Leave</th><th className="px-3 py-3">Worked</th><th className="px-3 py-3">Late time</th><th className="px-4 py-3">Overtime</th></tr></thead><tbody className="divide-y divide-white/[0.055]">{rows.map((row) => <tr key={row.staff?._id}><td className="px-4 py-3"><span className="font-medium text-white">{row.staff?.name}</span><span className="ml-2 text-xs text-neutral-600">{row.staff?.employeeId}</span></td><td className="px-3 py-3 text-emerald-300">{row.daysPresent}</td><td className="px-3 py-3 text-amber-300">{row.daysLate}</td><td className="px-3 py-3 text-red-300">{row.daysAbsent}</td><td className="px-3 py-3 text-blue-300">{row.leaveDays}</td><td className="px-3 py-3 text-neutral-300">{formatMinutes(row.totalWorkedMinutes)}</td><td className="px-3 py-3 text-neutral-300">{formatMinutes(row.totalLateMinutes)}</td><td className="px-4 py-3 text-neutral-300">{formatMinutes(row.overtimeMinutes)}</td></tr>)}</tbody></table></div>{loading && <div className="grid min-h-36 place-items-center"><LoaderCircle className="h-5 w-5 animate-spin text-dune-amber" /></div>}{!loading && !rows.length && <p className="py-12 text-center text-sm text-neutral-500">No scheduled attendance data for this month.</p>}</section>;
}
