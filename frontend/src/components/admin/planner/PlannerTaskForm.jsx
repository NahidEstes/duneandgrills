"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";
import { createPlannerReminder, editPlannerReminder, fetchPlannerReferences } from "@/src/api/api.js";
import { PLANNER_CATEGORIES, PLANNER_REPEATS, PLANNER_REFERENCE_TYPES, PLANNER_STATUSES, PLANNER_TEMPLATES, PLANNER_WEEKDAYS, addPlannerDays, plannerDay, plannerRepeatOf } from "@/src/utils/planner.js";
import { useDialogClose } from "../../ui/useDialogChanges.js";
import { inputClass, StaffDialog } from "../staff/staffUi.jsx";

function CancelButton({ disabled }) { const close = useDialogClose(); return <button type="button" onClick={close} disabled={disabled} className="min-h-10 rounded-lg border border-white/20 px-5 text-sm text-neutral-300">Cancel</button>; }

const fieldClass = `${inputClass} mt-1.5 h-10 rounded-lg`;
function ReferencePicker({ type, value, label, fallback, onChange, disabled }) {
  const [rows, setRows] = useState([]), [search, setSearch] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  const [labels, setLabels] = useState(() => value && fallback ? { [value]: fallback } : {});
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    const timer = setTimeout(() => fetchPlannerReferences(type, search, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setLabels(current => ({ ...current, ...Object.fromEntries(value.map(row => [row.id, row.label])) })); setRows(value); } }).catch(() => { if (!controller.signal.aborted) setError("References unavailable. Retry or leave this optional field empty."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }), 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [type, search, retry]);
  const options = value && !rows.some(row => row.id === value) ? [{ id: value, label: labels[value] || "Previously linked record" }, ...rows] : rows;
  return <div className="space-y-2"><label className="block text-xs text-neutral-400">{label}<DarkSelect aria-label={label} disabled={disabled} value={value} onChange={event => onChange(event.target.value)} className={fieldClass}><option value="">None</option>{options.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</DarkSelect></label><input type="search" aria-label={`Search ${label}`} placeholder={type === "staff" ? "Search staff name or ID…" : "Search record name or ID…"} disabled={disabled} value={search} onChange={event => setSearch(event.target.value)} className="h-8 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-xs text-white outline-none focus:border-dune-amber/60" />{loading && <p role="status" className="text-xs text-neutral-500">Loading options…</p>}{error && <p role="alert" className="text-xs text-amber-300">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="underline">Retry options</button></p>}</div>;
}

export default function PlannerTaskForm({ task, initialDate, onClose, onSaved, onSchedule }) {
  const originalRepeat = plannerRepeatOf(task);
  const [form, setForm] = useState(() => ({ title: task?.title || "", category: task?.category || "Daily Routine", priority: task?.priority || "Normal", dueDate: task?.dueDate || initialDate || plannerDay(), time: task?.time || "10:00", repeat: originalRepeat, repeatOptions: task?.series?.repeatOptions || { unit: "weeks", interval: 1, weekdays: [new Date(`${task?.dueDate || initialDate || plannerDay()}T12:00:00Z`).getUTCDay()] }, responsibleId: task?.responsible?.id || "", linkedType: task?.linkedRecord?.type || "", linkedId: task?.linkedRecord?.id || "", checklist: (task?.checklist || []).map(row => ({ text: row.text, done: row.done })), notes: task?.notes || "", completionNote: "", status: task?.status || "Pending" }));
  const [scope, setScope] = useState("occurrence"), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [template, setTemplate] = useState(""), [more, setMore] = useState(!!task);
  const pending = useRef(null), lock = useRef(false);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const repeatLocked = !!task?.series?.endBefore || !!task && originalRepeat !== "none" && scope === "occurrence";
  const applyTemplate = id => {
    setTemplate(id);
    const preset = PLANNER_TEMPLATES.find(row => row.id === id);
    if (!preset) return;
    setForm(current => ({ ...current, title: preset.title, category: preset.category, checklist: preset.checklist.map(text => ({ text, done: false })) }));
  };
  const updateSchedule = async () => {
    if (lock.current) return;
    lock.current = true; setSaving(true); setError("");
    try { await onSchedule?.(task); }
    catch (error) { setError(error.response?.data?.message || "Unable to update the schedule. Your entries are kept; retry or reopen this reminder to review its schedule."); }
    finally { lock.current = false; setSaving(false); }
  };
  const save = async event => {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setSaving(true); setError("");
    const { linkedType, linkedId, status, repeatOptions, completionNote, ...values } = form;
    const payload = { ...values, repeatOptions: form.repeat === "custom" ? repeatOptions : null, linkedRecord: linkedType && linkedId ? { type: linkedType, id: linkedId } : null, ...(task ? { revision: task.revision, scope: originalRepeat === "none" && form.repeat !== "none" ? "future" : scope, status, ...(status === "Done" && task.status !== "Done" && scope !== "future" ? { completionNote } : {}) } : {}) };
    const signature = JSON.stringify(payload);
    if (pending.current && pending.current.signature !== signature) {
      setError("The previous save may have completed. Retry with the original details, or refresh Planner to check before creating a changed reminder.");
      setSaving(false); lock.current = false; return;
    }
    pending.current ||= { signature, requestId: crypto.randomUUID() };
    try {
      const body = { ...payload, requestId: pending.current.requestId };
      if (task) await editPlannerReminder(task._id, body); else await createPlannerReminder(body);
      onSaved();
    } catch (error) { if ([400, 422].includes(error.response?.status)) pending.current = null; setMore(true); setError(error.response?.data?.message || "Unable to save the reminder. Your entries have been kept. Retry, or refresh to check the result."); }
    finally { lock.current = false; setSaving(false); }
  };
  return <StaffDialog open onClose={() => { if (!saving) onClose(); }} title={task ? "Edit planner task" : "Add planner task"} maxWidth="max-w-xl">
    <p className="-mt-2 mb-5 text-xs text-neutral-400">Set a date, add a checklist, and choose whether this task repeats.</p>
    <form aria-busy={saving} onSubmit={save} onInvalidCapture={() => setMore(true)} className="flex max-h-[calc(100dvh-13rem)] min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1"><fieldset disabled={saving} className="min-w-0 space-y-4">
        {!task && <label className="block text-xs text-neutral-400">Quick template<DarkSelect aria-label="Quick template" value={template} onChange={event => applyTemplate(event.target.value)} className={fieldClass}><option value="">Start from scratch</option>{PLANNER_TEMPLATES.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</DarkSelect><span className="mt-1 block text-xs text-neutral-500">Templates replace the title, category and checklist. Review before saving.</span></label>}
        <label className="block text-xs text-neutral-400">Task title<input required maxLength={160} value={form.title} onChange={event => set("title", event.target.value)} className={fieldClass} placeholder="e.g. Weekly deep cleaning" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs text-neutral-400">Due date<DarkDatePicker required aria-label="Planner due date" min="2020-01-01" max={addPlannerDays(plannerDay(), 730)} value={form.dueDate} onChange={event => set("dueDate", event.target.value)} className={fieldClass} /></label><label className="block text-xs text-neutral-400">Time<input type="time" required value={form.time} onChange={event => set("time", event.target.value)} className={`${fieldClass} [color-scheme:dark]`} /><span className="mt-1 block text-xs text-neutral-500">Riyadh time</span></label></div>
        <fieldset><legend className="mb-2 text-sm text-neutral-200">Checklist</legend><div className="space-y-2">{form.checklist.map((row, index) => <div key={index} className="flex items-center gap-2"><input type="checkbox" aria-label={`Complete checklist item ${index + 1}`} checked={row.done} onChange={event => set("checklist", form.checklist.map((value, i) => i === index ? { ...value, done: event.target.checked } : value))} className="h-4 w-4 shrink-0 accent-amber-500" /><input required maxLength={200} aria-label={`Checklist item ${index + 1}`} value={row.text} onChange={event => set("checklist", form.checklist.map((value, i) => i === index ? { ...value, text: event.target.value } : value))} className={`${inputClass} h-9 rounded-lg text-xs`} placeholder="Checklist item" /><button type="button" aria-label={`Remove checklist item ${index + 1}`} onClick={() => set("checklist", form.checklist.filter((_, i) => i !== index))} className="grid min-h-10 min-w-10 place-items-center text-neutral-500 hover:text-red-300"><Trash2 size={15} /></button></div>)}</div><button type="button" disabled={form.checklist.length >= 30} onClick={() => set("checklist", [...form.checklist, { text: "", done: false }])} className="mt-2 inline-flex min-h-9 items-center gap-2 text-xs text-dune-amber disabled:opacity-50"><Plus size={15} />Add checklist item</button></fieldset>
        <button type="button" aria-expanded={more} aria-controls="planner-more-options" onClick={() => setMore(value => !value)} className="flex min-h-10 w-full items-center justify-between rounded-lg border border-white/15 px-3 text-sm text-neutral-200"><span>More options</span><span aria-hidden="true">{more ? "−" : "+"}</span></button>
        <div id="planner-more-options" hidden={!more} className="space-y-4">
          {task && originalRepeat !== "none" && <fieldset className="rounded-xl border border-dune-amber/20 p-3"><legend className="px-1 text-xs text-neutral-400">Apply changes to</legend><div className="flex flex-wrap gap-4 text-xs text-neutral-300">{[["occurrence", "This occurrence"], ["future", "This and future reminders"]].map(([value, label]) => <label key={value} className="flex min-h-8 items-center gap-2"><input type="radio" name="planner-edit-scope" value={value} checked={scope === value} disabled={value === "future" && !!task.series?.endBefore} onChange={() => setScope(value)} className="accent-amber-500" />{label}</label>)}</div><p className="mt-1 text-xs text-neutral-500">{task.series?.endBefore ? "This schedule was replaced. Edit this occurrence here; open a reminder from the current schedule to change future reminders." : "Future changes keep completed and cancelled history."}</p></fieldset>}
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs text-neutral-400">Category<DarkSelect aria-label="Planner category" value={form.category} onChange={event => set("category", event.target.value)} className={fieldClass}>{PLANNER_CATEGORIES.map(value => <option key={value}>{value}</option>)}</DarkSelect></label><label className="block text-xs text-neutral-400">Priority<DarkSelect aria-label="Planner priority" value={form.priority} onChange={event => set("priority", event.target.value)} className={fieldClass}>{["Normal", "High"].map(value => <option key={value}>{value}</option>)}</DarkSelect></label></div>
          <label className="block text-xs text-neutral-400">Repeat<DarkSelect aria-label="Planner repeat" disabled={repeatLocked} value={form.repeat} onChange={event => set("repeat", event.target.value)} className={fieldClass}>{PLANNER_REPEATS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</DarkSelect></label>
          {form.repeat === "custom" && <fieldset disabled={repeatLocked} className="space-y-3 rounded-xl border border-white/10 p-3"><legend className="px-1 text-xs text-neutral-300">Custom repeat</legend><div className="grid grid-cols-2 gap-3"><label className="text-xs text-neutral-400">Every<input type="number" required min={1} max={form.repeatOptions.unit === "weeks" ? 52 : 24} aria-label="Repeat interval" value={form.repeatOptions.interval} onChange={event => set("repeatOptions", { ...form.repeatOptions, interval: event.target.value === "" ? "" : Number(event.target.value) })} className={fieldClass} /></label><label className="text-xs text-neutral-400">Unit<DarkSelect aria-label="Repeat unit" value={form.repeatOptions.unit} onChange={event => set("repeatOptions", { ...form.repeatOptions, unit: event.target.value, weekdays: event.target.value === "weeks" ? [new Date(`${form.dueDate}T12:00:00Z`).getUTCDay()] : [] })} className={fieldClass}><option value="weeks">Weeks</option><option value="months">Months</option></DarkSelect></label></div>{form.repeatOptions.unit === "weeks" && <div className="flex flex-wrap gap-2">{PLANNER_WEEKDAYS.map((day, index) => <label key={day} className="flex min-h-9 items-center gap-1.5 text-xs text-neutral-300"><input type="checkbox" aria-label={`Repeat on ${day}`} checked={form.repeatOptions.weekdays.includes(index)} onChange={event => set("repeatOptions", { ...form.repeatOptions, weekdays: event.target.checked ? [...form.repeatOptions.weekdays, index].sort() : form.repeatOptions.weekdays.filter(value => value !== index) })} className="accent-amber-500" />{day.slice(0, 3)}</label>)}</div>}</fieldset>}
          {["monthly", "quarterly", "yearly"].includes(form.repeat) || form.repeat === "custom" && form.repeatOptions.unit === "months" ? <p className="text-xs text-neutral-500">Short months use their last day; the original day returns when available. February 29 uses February 28 in non-leap years.</p> : null}
          <ReferencePicker type="staff" value={form.responsibleId} label="Responsible person (optional)" fallback={task?.responsible?.name} onChange={value => set("responsibleId", value)} disabled={saving} />
          <label className="block text-xs text-neutral-400">Link to a record (optional)<DarkSelect aria-label="Planner reference type" value={form.linkedType} onChange={event => setForm(current => ({ ...current, linkedType: event.target.value, linkedId: "" }))} className={fieldClass}>{PLANNER_REFERENCE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</DarkSelect></label>
          {form.linkedType && <ReferencePicker key={form.linkedType} type={form.linkedType} value={form.linkedId} label="Linked record" fallback={task?.linkedRecord?.label} onChange={value => set("linkedId", value)} disabled={saving} />}
          {task?.linkedRecord?.available === false && <p className="text-xs text-amber-300">The previous record is unavailable. Keep its reference, clear it, or choose another record.</p>}
          {task?.linkedRecord?.href && form.linkedType === task.linkedRecord.type && form.linkedId === String(task.linkedRecord.id) && <Link href={task.linkedRecord.href} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-dune-amber underline">View linked record (read-only)</Link>}
          <label className="block text-xs text-neutral-400">Notes<textarea aria-label="Notes" rows={2} maxLength={2000} value={form.notes} onChange={event => set("notes", event.target.value)} className={`${fieldClass} h-auto py-3`} placeholder="Add any useful details…" /></label>
          {task && scope !== "future" && form.status === "Done" && task.status !== "Done" && <label className="block text-xs text-neutral-400">Completion note (optional)<textarea aria-label="Completion note" maxLength={1000} rows={3} value={form.completionNote} onChange={event => set("completionNote", event.target.value)} className={`${fieldClass} h-auto py-3`} /></label>}
          {task && <><label className="block text-xs text-neutral-400">Status<DarkSelect aria-label="Planner task status" disabled={scope === "future"} value={form.status} onChange={event => set("status", event.target.value)} className={fieldClass}>{PLANNER_STATUSES.map(value => <option key={value}>{value}</option>)}</DarkSelect></label>{originalRepeat !== "none" && !task.series?.endBefore && <div className="rounded-xl border border-white/10 p-3"><p className="text-xs leading-5 text-neutral-400">Pausing stops new occurrences and all alerts for this schedule. Existing tasks remain visible. Resume continues without missing-date backfill or old alerts.</p><button type="button" disabled={saving} onClick={updateSchedule} className="mt-2 min-h-10 text-sm text-dune-amber">{task.series?.paused ? "Resume schedule" : "Pause schedule"}</button></div>}<details className="text-xs text-neutral-400"><summary className="min-h-8 cursor-pointer text-neutral-300">Task history</summary><ul className="mt-2 space-y-2">{[...(task.history || []), ...(task.series?.history || [])].sort((a, b) => new Date(b.at) - new Date(a.at)).map((row, index) => <li key={index}>{row.action} · {row.actor?.name || "Admin"} · {new Date(row.at).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })} Riyadh</li>)}</ul></details></>}
        </div>
        {!more && <p className="text-xs text-neutral-500">{form.category} · {form.priority} priority · {PLANNER_REPEATS.find(([value]) => value === form.repeat)?.[1]}{form.notes || form.linkedId || form.responsibleId ? " · Optional details saved" : ""}</p>}
        <p className="text-xs leading-5 text-neutral-500">Reminder only. Completing a task does not record a payment or change stock.</p>
      </fieldset></div>
      {error && <p role="alert" className="mt-3 shrink-0 rounded-lg border border-amber-500/20 p-3 text-sm text-amber-300">{error}</p>}
      <div className="mt-4 flex shrink-0 justify-end gap-3 border-t border-white/10 pt-4"><CancelButton disabled={saving} /><button type="submit" disabled={saving} className="min-h-10 rounded-lg bg-dune-amber px-5 text-sm font-semibold text-black disabled:opacity-50">{saving ? "Saving…" : task ? "Save changes" : "Save task"}</button></div>
    </form>
  </StaffDialog>;
}
