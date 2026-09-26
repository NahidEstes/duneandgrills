"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, KeyRound, LoaderCircle, Pencil, Plus, Power, Search } from "lucide-react";
import { toast } from "sonner";
import { createStaffAccount, fetchShifts, fetchStaffAccounts, resetStaffAccountPassword, resetStaffAttendancePin, setStaffAccountActive, updateStaffAccount } from "@/src/api/api.js";
import { useAuth } from "@/src/context/AuthContext.jsx";
import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import { formatAdminDate } from "./adminUi.js";
import { inputClass, panelClass, StaffDialog } from "./staff/staffUi.jsx";

const ROLES = ["admin", "manager", "cashier", "kitchen", "inventory", "storekeeper", "accountant"];
const EMPTY = { name: "", email: "", phone: "", role: "cashier", password: "", employeeId: "", joiningDate: "", defaultShift: "", attendanceEnabled: false, pin: "" };

export default function StaffManagement() {
  const { user } = useAuth();
  const canManage = user?.role === "admin";
  const [rows, setRows] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [resetMode, setResetMode] = useState("password");
  const [form, setForm] = useState(EMPTY);
  const [credential, setCredential] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [staff, shiftRows] = await Promise.all([fetchStaffAccounts(), fetchShifts(true)]);
      setRows(staff);
      setShifts(shiftRows);
    } catch (error) { toast.error(error.response?.data?.message || "Unable to load staff accounts."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return !term ? rows : rows.filter((row) => [row.name, row.email, row.phone, row.role, row.employeeId].some((value) => String(value || "").toLowerCase().includes(term)));
  }, [query, rows]);

  const openCreate = () => { setEditing({ create: true }); setForm(EMPTY); };
  const openEdit = (row) => {
    setEditing(row);
    setForm({ name: row.name, email: row.email, phone: row.phone || "", role: row.role, password: "", employeeId: row.employeeId || "", joiningDate: row.joiningDate ? row.joiningDate.slice(0, 10) : "", defaultShift: row.defaultShift?._id || "", attendanceEnabled: row.attendanceEnabled === true, pin: "" });
  };

  const save = async (event) => {
    event.preventDefault();
    if (form.attendanceEnabled && (!form.defaultShift || (editing?.create && !form.pin))) return toast.error("Choose an active shift and PIN before enabling attendance.");
    setSaving(true);
    try {
      if (editing.create) await createStaffAccount(form);
      else await updateStaffAccount(editing._id, { name: form.name, email: form.email, phone: form.phone, role: form.role, employeeId: form.employeeId, joiningDate: form.joiningDate, defaultShift: form.defaultShift || null, attendanceEnabled: form.attendanceEnabled });
      toast.success(editing.create ? "Staff account created." : "Staff profile updated.");
      setEditing(null);
      setForm(EMPTY);
      await load();
    } catch (error) { toast.error(error.response?.data?.message || "Unable to save staff account."); }
    finally { setSaving(false); }
  };

  const toggle = async (row) => {
    const active = row.isActive === false;
    if (!window.confirm(`${active ? "Reactivate" : "Deactivate"} ${row.name}?${active ? "" : " Their existing sessions will be revoked."}`)) return;
    try { await setStaffAccountActive(row._id, active); toast.success(active ? "Staff account reactivated." : "Staff account deactivated."); await load(); }
    catch (error) { toast.error(error.response?.data?.message || "Unable to update staff access."); }
  };

  const openReset = (row, mode) => { setResetting(row); setResetMode(mode); setCredential(""); };
  const resetCredential = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      if (resetMode === "pin") await resetStaffAttendancePin(resetting._id, credential);
      else await resetStaffAccountPassword(resetting._id, credential);
      toast.success(resetMode === "pin" ? "Attendance PIN updated." : "Password updated and previous sessions revoked.");
      setResetting(null);
      setCredential("");
    } catch (error) { toast.error(error.response?.data?.message || `Unable to reset the ${resetMode}.`); }
    finally { setSaving(false); }
  };

  return <div className="space-y-4">
    <div className={`${panelClass} flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between`}><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search staff, employee ID…" className={`${inputClass} pl-9`} /></div>{canManage ? <button type="button" onClick={openCreate} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-dune-amber px-4 text-sm font-semibold text-black"><Plus className="h-4 w-4" />Add staff</button> : <p className="text-xs text-neutral-500">Manager access is read-only.</p>}</div>

    <div className={`${panelClass} overflow-hidden`}><div className="overflow-x-auto"><table className="w-full min-w-[1060px] text-left text-sm"><thead className="border-b border-white/[0.07] text-xs text-neutral-500"><tr><th className="px-4 py-3">Staff</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Shift</th><th className="px-3 py-3">Time clock</th><th className="px-3 py-3">Joined</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-white/[0.055]">{visible.map((row) => <tr key={row._id} className="hover:bg-white/[0.025]"><td className="px-4 py-3"><span className="block font-medium text-white">{row.name}</span><span className="text-xs text-neutral-500">{row.employeeId || "No employee ID"}</span></td><td className="px-3 py-3"><span className="block text-neutral-300">{row.email}</span><span className="text-xs text-neutral-500">{row.phone || "No phone"}</span></td><td className="px-3 py-3 capitalize text-neutral-300">{row.role}</td><td className="px-3 py-3"><span className="text-neutral-300">{row.defaultShift?.name || "Not assigned"}</span><span className="block text-xs text-neutral-500">{row.defaultShift ? `${row.defaultShift.startTime}–${row.defaultShift.endTime}` : ""}</span></td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs ${row.attendanceEnabled ? "bg-emerald-500/10 text-emerald-300" : "bg-neutral-500/10 text-neutral-400"}`}>{row.attendanceEnabled ? "Enabled" : "Disabled"}</span></td><td className="px-3 py-3 text-xs text-neutral-500">{row.joiningDate ? formatAdminDate(row.joiningDate) : "—"}</td><td className="px-4 py-3"><div className="flex justify-end gap-1">{canManage && <><button type="button" onClick={() => openEdit(row)} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white" aria-label={`Edit ${row.name}`}><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => openReset(row, "pin")} className="rounded-lg p-2 text-neutral-500 hover:bg-amber-500/10 hover:text-amber-300" aria-label={`Reset attendance PIN for ${row.name}`}><CalendarClock className="h-4 w-4" /></button><button type="button" onClick={() => openReset(row, "password")} className="rounded-lg p-2 text-neutral-500 hover:bg-amber-500/10 hover:text-amber-300" aria-label={`Reset password for ${row.name}`}><KeyRound className="h-4 w-4" /></button><button type="button" onClick={() => toggle(row)} className={`rounded-lg p-2 ${row.isActive === false ? "text-emerald-400 hover:bg-emerald-500/10" : "text-red-400 hover:bg-red-500/10"}`} aria-label={`${row.isActive === false ? "Reactivate" : "Deactivate"} ${row.name}`}><Power className="h-4 w-4" /></button></>}</div></td></tr>)}</tbody></table></div>{loading && <p className="px-4 py-10 text-center text-sm text-neutral-500">Loading staff accounts…</p>}{!loading && !visible.length && <p className="px-4 py-10 text-center text-sm text-neutral-500">No matching staff accounts.</p>}</div>

    <StaffDialog open={Boolean(editing)} onClose={() => { setEditing(null); setForm(EMPTY); }} title={editing?.create ? "Add staff account" : "Edit staff profile"}><form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      {[["Name","name","text",true],["Email","email","email",true],["Phone","phone","tel",false],["Employee ID","employeeId","text",false]].map(([label,key,type,required]) => <label key={key} className="block text-sm text-neutral-300">{label}<input required={required} type={type} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className={`${inputClass} mt-2`} /></label>)}
      <label className="block text-sm text-neutral-300">Role<DarkSelect value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className={`${inputClass} mt-2`}>{ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</DarkSelect></label>
      <label className="block text-sm text-neutral-300">Joining date<DarkDatePicker value={form.joiningDate} onChange={(event) => setForm({ ...form, joiningDate: event.target.value })} className={`${inputClass} mt-2`} /></label>
      <label className="block text-sm text-neutral-300">Default shift<DarkSelect value={form.defaultShift} onChange={(event) => setForm({ ...form, defaultShift: event.target.value })} className={`${inputClass} mt-2`}><option value="">Not assigned</option>{shifts.filter((shift) => shift.isActive).map((shift) => <option key={shift._id} value={shift._id}>{shift.name} · {shift.startTime}–{shift.endTime}</option>)}</DarkSelect></label>
      {editing?.create && <><label className="block text-sm text-neutral-300">Temporary password<input required type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className={`${inputClass} mt-2`} /><span className="mt-1 block text-xs text-neutral-500">10+ characters with uppercase, lowercase, number and symbol.</span></label><label className="block text-sm text-neutral-300">Attendance PIN<input type="password" inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value.replace(/\D/g, "") })} className={`${inputClass} mt-2 tracking-[0.3em]`} /><span className="mt-1 block text-xs text-neutral-500">4–6 digits; never displayed after saving.</span></label></>}
      <label className="col-span-full flex min-h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-neutral-300"><input type="checkbox" checked={form.attendanceEnabled} onChange={(event) => setForm({ ...form, attendanceEnabled: event.target.checked })} className="h-4 w-4 accent-amber-500" />Enable Staff Clock access</label>
      <button type="submit" disabled={saving} className="col-span-full flex h-11 items-center justify-center gap-2 rounded-xl bg-dune-amber font-semibold text-black disabled:opacity-50">{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}{editing?.create ? "Create staff" : "Save changes"}</button>
    </form></StaffDialog>

    <StaffDialog open={Boolean(resetting)} onClose={() => { setResetting(null); setCredential(""); }} title={`${resetMode === "pin" ? "Reset attendance PIN" : "Reset password"} · ${resetting?.name || ""}`} maxWidth="max-w-lg"><form onSubmit={resetCredential} className="space-y-4"><p className="text-sm leading-6 text-neutral-400">{resetMode === "pin" ? "The new PIN only authorizes clock in/out actions and cannot access the admin dashboard." : "Saving a new password immediately revokes this staff member's previous sessions."}</p><label className="block text-sm text-neutral-300">New {resetMode === "pin" ? "PIN" : "temporary password"}<input required type="password" inputMode={resetMode === "pin" ? "numeric" : undefined} pattern={resetMode === "pin" ? "[0-9]{4,6}" : undefined} maxLength={resetMode === "pin" ? 6 : undefined} autoComplete="new-password" value={credential} onChange={(event) => setCredential(resetMode === "pin" ? event.target.value.replace(/\D/g, "") : event.target.value)} className={`${inputClass} mt-2`} /></label><button type="submit" disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-dune-amber font-semibold text-black disabled:opacity-50">{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}Save new {resetMode === "pin" ? "PIN" : "password"}</button></form></StaffDialog>
  </div>;
}
