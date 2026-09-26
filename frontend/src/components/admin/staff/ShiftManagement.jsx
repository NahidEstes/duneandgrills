"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, LoaderCircle, Pencil, Plus, Power } from "lucide-react";
import { toast } from "sonner";
import { archiveShift, createShift, fetchShifts, updateShift } from "@/src/api/api.js";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { inputClass, panelClass, StaffDialog } from "./staffUi.jsx";

const DAYS = [{ value: 0, label: "Sun" }, { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" }, { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }];
const EMPTY = { name: "", startTime: "09:00", endTime: "18:00", gracePeriodMinutes: 5, daysOfWeek: DAYS.map((day) => day.value), isActive: true };

export default function ShiftManagement() {
  const { user } = useAuth();
  const canManage = user?.role === "admin";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const load = useCallback(async () => { setLoading(true); try { setRows(await fetchShifts(true)); } catch (error) { toast.error(error.response?.data?.message || "Unable to load shifts."); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing({ create: true }); setForm(EMPTY); };
  const openEdit = (row) => { setEditing(row); setForm({ name: row.name, startTime: row.startTime, endTime: row.endTime, gracePeriodMinutes: row.gracePeriodMinutes, daysOfWeek: row.daysOfWeek || [], isActive: row.isActive !== false }); };
  const toggleDay = (value) => setForm((current) => ({ ...current, daysOfWeek: current.daysOfWeek.includes(value) ? current.daysOfWeek.filter((day) => day !== value) : [...current.daysOfWeek, value].sort() }));
  const save = async (event) => {
    event.preventDefault(); setSaving(true);
    try { if (editing.create) await createShift(form); else await updateShift(editing._id, form); toast.success(editing.create ? "Shift created." : "Shift updated."); setEditing(null); await load(); }
    catch (error) { toast.error(error.response?.data?.message || "Unable to save shift."); }
    finally { setSaving(false); }
  };
  const archive = async (row) => {
    if (!window.confirm(`Archive ${row.name}? This is allowed only after active staff have been reassigned.`)) return;
    try { await archiveShift(row._id); toast.success("Shift archived. Historical attendance was preserved."); await load(); }
    catch (error) { toast.error(error.response?.data?.message || "Unable to archive shift."); }
  };

  return <div className="space-y-4"><div className={`${panelClass} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}><div><h2 className="font-semibold text-white">Shift Templates</h2><p className="mt-1 text-sm text-neutral-500">Scheduled hours and grace periods drive attendance status.</p></div>{canManage ? <button type="button" onClick={openCreate} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-dune-amber px-4 text-sm font-semibold text-black"><Plus className="h-4 w-4" />Create shift</button> : <p className="text-xs text-neutral-500">Manager access is read-only.</p>}</div>
    <div className="grid gap-3 lg:grid-cols-2">{rows.map((row) => <article key={row._id} className={`${panelClass} p-5 ${row.isActive === false ? "opacity-60" : ""}`}><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-dune-amber/10 text-dune-amber"><Clock3 className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="font-semibold text-white">{row.name}</h3><span className={`rounded-full px-2 py-0.5 text-[0.65rem] ${row.isActive ? "bg-emerald-500/10 text-emerald-300" : "bg-neutral-500/10 text-neutral-400"}`}>{row.isActive ? "Active" : "Archived"}</span></div><p className="mt-2 text-xl font-semibold tabular-nums text-neutral-200">{row.startTime} – {row.endTime}</p><p className="mt-1 text-xs text-neutral-500">Grace period: {row.gracePeriodMinutes} minutes</p><div className="mt-3 flex flex-wrap gap-1">{DAYS.map((day) => <span key={day.value} className={`rounded-md px-2 py-1 text-[0.65rem] ${row.daysOfWeek?.includes(day.value) ? "bg-dune-amber/10 text-dune-amber" : "bg-white/[0.03] text-neutral-700"}`}>{day.label}</span>)}</div></div>{canManage && <div className="flex gap-1"><button type="button" onClick={() => openEdit(row)} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white" aria-label={`Edit ${row.name}`}><Pencil className="h-4 w-4" /></button>{row.isActive && <button type="button" onClick={() => archive(row)} className="rounded-lg p-2 text-red-400 hover:bg-red-500/10" aria-label={`Archive ${row.name}`}><Power className="h-4 w-4" /></button>}</div>}</div></article>)}{loading && <div className="col-span-full grid min-h-48 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-dune-amber" /></div>}{!loading && !rows.length && <div className={`${panelClass} col-span-full py-16 text-center text-sm text-neutral-500`}>No shifts configured. Create a shift before enabling Staff Clock access.</div>}</div>

    <StaffDialog open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.create ? "Create shift" : "Edit shift"}><form onSubmit={save} className="space-y-4"><label className="block text-sm text-neutral-300">Shift name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Morning Shift" className={`${inputClass} mt-2`} /></label><div className="grid gap-4 sm:grid-cols-3"><label className="text-sm text-neutral-300">Start time<input required type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} className={`${inputClass} mt-2 [color-scheme:dark]`} /></label><label className="text-sm text-neutral-300">End time<input required type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} className={`${inputClass} mt-2 [color-scheme:dark]`} /></label><label className="text-sm text-neutral-300">Grace minutes<input required type="number" min="0" max="120" value={form.gracePeriodMinutes} onChange={(event) => setForm({ ...form, gracePeriodMinutes: Number(event.target.value) })} className={`${inputClass} mt-2`} /></label></div><fieldset><legend className="text-sm text-neutral-300">Working days</legend><div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">{DAYS.map((day) => <button key={day.value} type="button" aria-pressed={form.daysOfWeek.includes(day.value)} onClick={() => toggleDay(day.value)} className={`h-10 rounded-xl border text-xs font-semibold ${form.daysOfWeek.includes(day.value) ? "border-dune-amber bg-dune-amber/10 text-dune-amber" : "border-white/10 text-neutral-500"}`}>{day.label}</button>)}</div></fieldset><label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-neutral-300"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="h-4 w-4 accent-amber-500" />Active shift</label><button disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-dune-amber font-semibold text-black disabled:opacity-50">{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}{editing?.create ? "Create shift" : "Save shift"}</button></form></StaffDialog>
  </div>;
}
