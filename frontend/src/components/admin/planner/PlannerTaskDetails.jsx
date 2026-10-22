"use client";

import { useRef, useState } from "react";
import { StaffDialog, inputClass } from "../staff/staffUi.jsx";
import { useDialogClose } from "../../ui/useDialogChanges.js";

export const plannerTimestamp = value => value && Number.isFinite(+new Date(value)) ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not recorded";
export const completionTiming = task => !task.completion?.at || !task.completion?.dueAt ? "Unavailable" : +new Date(task.completion.at) <= +new Date(task.completion.dueAt) ? "On time" : "Late";
export function PlannerTiming({ task }) {
  const text = completionTiming(task);
  return <span className={`inline-block rounded-md border px-2 py-1 text-xs ${text === "On time" ? "border-emerald-500/30 text-emerald-300" : text === "Late" ? "border-amber-500/30 text-amber-300" : "border-white/10 text-neutral-400"}`}>{text === "Unavailable" ? "Timing unavailable" : text}</span>;
}

export default function PlannerTaskDetails({ task, onClose }) {
  const completion = task.status === "Done" ? task.completion : null;
  const checklist = completion?.checklist || task.checklist || [];
  const rows = [...(task.history || []), ...(task.series?.history || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
  return <StaffDialog open title="Task details" onClose={onClose} maxWidth="max-w-3xl">
    <div className="space-y-5 text-sm text-neutral-300">
      <div><h3 className="break-words text-xl font-semibold text-white">{completion?.title || task.title}</h3><p className="mt-2 text-xs text-neutral-400">{completion?.category || task.category} · <span className={task.status === "Done" ? "text-emerald-300" : "text-dune-amber"}>{task.status}</span></p></div>
      <dl className="grid gap-4 border-y border-white/10 py-4 sm:grid-cols-2">{[
        [completion ? "Responsible person at completion" : "Responsible person", (completion ? completion.responsible : task.responsible)?.name || "Unassigned"],
        ["Marked done by", completion?.by?.name || "Not recorded"],
        [completion ? "Due at completion" : "Due", plannerTimestamp(completion?.dueAt || task.dueAt)],
        ["Completed", plannerTimestamp(task.completedAt)],
      ].map(([label, value]) => <div key={label}><dt className="text-xs text-neutral-400">{label}</dt><dd className="mt-1 break-words text-white">{value}</dd></div>)}</dl>
      {task.status === "Done" && <><PlannerTiming task={task} />{!completion && <p className="text-xs text-neutral-400">Completion attribution, deadline and checklist snapshot were not recorded for this older task. Assignment and checklist below are current values.</p>}{completion && (task.title !== completion.title || +new Date(task.dueAt) !== +new Date(completion.dueAt) || String(task.responsible?.id || "") !== String(completion.responsible?.id || "")) && <p className="text-xs text-neutral-400">This task was edited after completion. Current title: {task.title}. Current due: {plannerTimestamp(task.dueAt)}. Current responsible person: {task.responsible?.name || "Unassigned"}. Completion facts above are preserved.</p>}</>}
      <section><h4 className="font-medium text-white">Checklist{completion ? " at completion" : ""} · {checklist.filter(row => row.done).length} of {checklist.length}</h4><ul className="mt-3 space-y-2">{checklist.map((row, i) => <li key={i} className="flex items-start gap-2 break-words"><span className={row.done ? "text-emerald-300" : "text-neutral-500"} aria-label={row.done ? "Checked" : "Unchecked"}>{row.done ? "✓" : "○"}</span><span className="min-w-0 break-words">{row.text}</span></li>)}</ul>{!checklist.length && <p className="mt-2 text-xs text-neutral-400">No checklist items.</p>}</section>
      <section className="border-t border-white/10 pt-4"><h4 className="font-medium text-white">Completion note</h4><p className="mt-2 whitespace-pre-wrap break-words">{completion ? completion.note || "No note added." : "Not recorded"}</p></section>
      {task.notes && <section><h4 className="font-medium text-white">Task notes</h4><p className="mt-2 whitespace-pre-wrap break-words">{task.notes}</p></section>}
      <section className="border-t border-white/10 pt-4"><h4 className="font-medium text-white">Activity history</h4><p className="mt-1 text-xs text-neutral-400">Latest 100 task events, plus schedule activity. Riyadh time.</p><ol className="mt-4 space-y-4 border-l border-white/15 pl-4">{rows.map((row, i) => <li key={i} className="relative break-words"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-dune-amber" /><p>{row.action}</p><p className="mt-1 text-xs text-neutral-400">{row.actor?.name || "Not recorded"} · {plannerTimestamp(row.at)}</p>{row.completion && <details className="mt-2 text-xs text-neutral-400"><summary className="cursor-pointer py-1 text-dune-amber">Completion snapshot</summary><p className="mt-1">Responsible: {row.completion.responsible?.name || "Unassigned"} · Due: {plannerTimestamp(row.completion.dueAt)}</p><p>Checklist: {row.completion.checklist.filter(item => item.done).length} of {row.completion.checklist.length}</p><p className="whitespace-pre-wrap break-words">{row.completion.note || "No note added."}</p></details>}</li>)}</ol>{!rows.length && <p className="mt-3 text-xs text-neutral-400">No activity recorded.</p>}</section>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><p className="text-xs text-neutral-400">Reminder only. No stock or payments are changed.</p><button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-white/15 px-5">Close</button></div>
    </div>
  </StaffDialog>;
}

function CompletionForm({ task, onComplete }) {
  const close = useDialogClose(), [note, setNote] = useState(""), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  return <form aria-busy={saving} onSubmit={async event => {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setSaving(true); setError("");
    try { const saved = await onComplete(task, note); if (!saved) setError("Unable to complete this reminder. Your note is kept. Retry, or close and refresh to check its status."); }
    finally { lock.current = false; setSaving(false); }
  }} className="space-y-4"><p className="break-words text-sm text-neutral-300">{task.title}</p><p className="text-xs text-neutral-400">Responsible person: {task.responsible?.name || "Unassigned"}. Your account will be recorded as marked done by.</p><label className="block text-xs text-neutral-400">Completion note (optional)<textarea aria-label="Completion note" maxLength={1000} rows={3} disabled={saving} value={note} onChange={event => setNote(event.target.value)} className={`${inputClass} mt-2 h-auto py-3`} placeholder="Add a short completion note…" /></label>{error && <p role="alert" className="text-sm text-amber-300">{error}</p>}<p className="text-xs text-neutral-400">Completing this reminder does not record a payment or change stock.</p><div className="flex justify-end gap-3 border-t border-white/10 pt-4"><button type="button" disabled={saving} onClick={close} className="min-h-10 rounded-lg border border-white/15 px-4">Cancel</button><button type="submit" disabled={saving} className="min-h-10 rounded-lg bg-dune-amber px-4 font-medium text-black">{saving ? "Completing…" : "Mark as Done"}</button></div></form>;
}
export function PlannerCompleteDialog({ task, onClose, onComplete }) {
  return <StaffDialog open title="Complete reminder" onClose={onClose} maxWidth="max-w-lg"><CompletionForm task={task} onComplete={onComplete} /></StaffDialog>;
}
