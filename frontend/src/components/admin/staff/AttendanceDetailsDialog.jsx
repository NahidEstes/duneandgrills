"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { correctAttendance, fetchAttendanceDetails } from "@/src/api/api.js";
import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import AttendanceStatusBadge from "./AttendanceStatusBadge.jsx";
import { fromRiyadhDateTimeInput, toRiyadhDateTimeInput } from "./attendanceUtils.js";
import { formatMinutes, formatRiyadhTime, inputClass, StaffDialog } from "./staffUi.jsx";

const auditValue = (value) => {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return value.name || (value._id ? String(value._id) : JSON.stringify(value));
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString("en-SA", { timeZone: "Asia/Riyadh" });
  return String(value);
};

export default function AttendanceDetailsDialog({ recordId, canManage, onClose, onChanged }) {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(Boolean(recordId));
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ clockIn: "", clockOut: "", status: "completed", notes: "", reason: "" });

  useEffect(() => {
    if (!recordId) return;
    let active = true;
    setLoading(true);
    fetchAttendanceDetails(recordId).then((data) => {
      if (!active) return;
      setRow(data);
      setForm({ clockIn: toRiyadhDateTimeInput(data.clockIn), clockOut: toRiyadhDateTimeInput(data.clockOut), status: data.status, notes: data.notes || "", reason: "" });
    }).catch((error) => toast.error(error.response?.data?.message || "Unable to load attendance details.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [recordId]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await correctAttendance(recordId, { clockIn: fromRiyadhDateTimeInput(form.clockIn), clockOut: fromRiyadhDateTimeInput(form.clockOut), status: form.status, notes: form.notes, reason: form.reason });
      toast.success("Attendance corrected and audit history recorded.");
      await onChanged?.();
      onClose();
    } catch (error) { toast.error(error.response?.data?.message || "Unable to correct attendance."); }
    finally { setSaving(false); }
  };

  return <StaffDialog open={Boolean(recordId)} onClose={onClose} title="Attendance details" maxWidth="max-w-3xl">
    {loading ? <div className="grid min-h-56 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-dune-amber" /></div> : row && <div className="space-y-5">
      <div className="grid gap-3 rounded-xl border border-white/[0.08] bg-black/20 p-4 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-neutral-500">Staff</p><p className="mt-1 font-medium text-white">{row.staff?.name}</p><p className="text-xs text-neutral-500">{row.staff?.employeeId || row.staff?.role}</p></div><div><p className="text-xs text-neutral-500">Shift</p><p className="mt-1 text-sm text-neutral-200">{row.shiftName}</p><p className="text-xs text-neutral-500">{formatRiyadhTime(row.scheduledStart)}–{formatRiyadhTime(row.scheduledEnd)}</p></div><div><p className="text-xs text-neutral-500">Worked / Overtime</p><p className="mt-1 text-sm text-neutral-200">{formatMinutes(row.totalWorkedMinutes)} / {formatMinutes(row.overtimeMinutes)}</p></div><div><p className="text-xs text-neutral-500">Status</p><div className="mt-2"><AttendanceStatusBadge status={row.displayStatus} lateMinutes={row.lateMinutes} /></div></div></div>

      {canManage ? <form onSubmit={save} className="grid gap-4 rounded-xl border border-white/[0.08] p-4 sm:grid-cols-2"><label className="text-sm text-neutral-300">Clock in (Riyadh)<DarkDatePicker type="datetime-local" value={form.clockIn} onChange={(event) => setForm({ ...form, clockIn: event.target.value })} className={`${inputClass} mt-2`} /></label><label className="text-sm text-neutral-300">Clock out (Riyadh)<DarkDatePicker type="datetime-local" value={form.clockOut} onChange={(event) => setForm({ ...form, clockOut: event.target.value })} className={`${inputClass} mt-2`} /></label><label className="text-sm text-neutral-300">Stored status<DarkSelect value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className={`${inputClass} mt-2`}><option value="checked_in">Checked In</option><option value="completed">Completed</option><option value="on_time">On Time</option><option value="late">Late</option><option value="absent">Absent</option><option value="on_leave">On Leave</option></DarkSelect></label><label className="text-sm text-neutral-300">Correction reason<input required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Required for the audit log" className={`${inputClass} mt-2`} /></label><label className="col-span-full text-sm text-neutral-300">Admin notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-dune-amber/60" /></label><button disabled={saving} className="col-span-full flex h-11 items-center justify-center gap-2 rounded-xl bg-dune-amber font-semibold text-black disabled:opacity-50">{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}Save correction</button></form> : <p className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 text-sm text-neutral-500">Managers can review records and audit history. Only admins can make corrections.</p>}

      <section><h3 className="text-sm font-semibold text-white">Audit history</h3><div className="mt-3 space-y-2">{row.audit?.map((entry) => <article key={entry._id} className="rounded-xl border border-white/[0.07] bg-black/20 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-neutral-200">{entry.action.replaceAll("_", " ")}</p><time className="text-xs text-neutral-600">{new Date(entry.createdAt).toLocaleString("en-SA", { timeZone: "Asia/Riyadh" })}</time></div><p className="mt-1 text-xs text-neutral-500">{entry.actorName} · {entry.actorRole}{entry.reason ? ` · ${entry.reason}` : ""}</p>{entry.changedFields?.length > 0 && <div className="mt-2 space-y-1">{entry.changedFields.slice(0, 8).map((field) => <p key={field} className="text-xs text-neutral-500"><span className="text-dune-amber/80">{field}</span>: <span className="line-through decoration-red-500/50">{auditValue(entry.before?.[field])}</span> → <span className="text-neutral-300">{auditValue(entry.after?.[field])}</span></p>)}</div>}</article>)}{!row.audit?.length && <p className="text-sm text-neutral-600">No audit entries yet.</p>}</div></section>
    </div>}
  </StaffDialog>;
}
