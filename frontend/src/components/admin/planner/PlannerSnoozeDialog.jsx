"use client";
import { useRef, useState } from "react";
import { snoozePlannerReminder } from "@/src/api/api.js";
import { plannerDay, plannerUpdated } from "@/src/utils/planner.js";
import { StaffDialog, inputClass } from "../staff/staffUi.jsx";

export default function PlannerSnoozeDialog({ task, onClose, onSaved }) {
  const [day, setDay] = useState(plannerDay), [time, setTime] = useState("09:00"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(null), lock = useRef(false);
  const save = async option => {
    if (lock.current) return;
    const values = { revision: task.revision, option, ...(option === "custom" ? { until: `${day}T${time}:00+03:00` } : {}) };
    const signature = JSON.stringify(values);
    if (pending.current?.signature !== signature) pending.current = { signature, requestId: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError("");
    try { await snoozePlannerReminder(task._id, { ...values, requestId: pending.current.requestId }); plannerUpdated(); onSaved?.(); onClose(); }
    catch (error) { setError(error.response?.data?.message || "Unable to snooze. Refresh to check the reminder and retry."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <StaffDialog open title="Snooze reminder" onClose={() => { if (!busy) onClose(); }} maxWidth="max-w-md"><p className="mb-4 break-words text-sm text-white">{task.title}</p><p className="mb-4 text-xs leading-5 text-neutral-400">Only the next alert changes. The original deadline and overdue status stay unchanged. All times are Riyadh time.</p><div className="flex flex-wrap gap-2">{[["30m", "30 minutes"], ["1h", "1 hour"], ["tomorrow", "Tomorrow, 9 AM"], ...(task.snoozedUntil ? [["clear", "Clear snooze"]] : [])].map(([value, label]) => <button key={value} type="button" disabled={busy} onClick={() => save(value)} className="min-h-10 rounded-lg border border-white/20 px-3 text-xs text-neutral-200 disabled:opacity-50">{label}</button>)}</div><form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); save("custom"); }}><div className="grid grid-cols-2 gap-3"><label className="text-xs text-neutral-400">Custom date<input type="date" required aria-label="Snooze date" min={plannerDay()} value={day} onChange={event => setDay(event.target.value)} className={`${inputClass} mt-2 [color-scheme:dark]`} /></label><label className="text-xs text-neutral-400">Time<input type="time" required aria-label="Snooze time" value={time} onChange={event => setTime(event.target.value)} className={`${inputClass} mt-2 [color-scheme:dark]`} /></label></div>{error && <p role="alert" className="text-xs text-amber-300">{error}</p>}<div className="flex justify-end gap-3 border-t border-white/10 pt-4"><button type="button" disabled={busy} onClick={onClose} className="min-h-10 px-3 text-sm text-neutral-300">Cancel</button><button disabled={busy} className="min-h-10 rounded-lg bg-dune-amber px-4 text-sm font-semibold text-black">{busy ? "Saving…" : "Set custom snooze"}</button></div></form></StaffDialog>;
}
