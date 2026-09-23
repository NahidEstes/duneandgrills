"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, LoaderCircle, Pencil, Plus, Power, Search, X } from "lucide-react";
import { toast } from "sonner";
import { createStaffAccount, fetchStaffAccounts, resetStaffAccountPassword, setStaffAccountActive, updateStaffAccount } from "@/src/api/api.js";
import { useAuth } from "@/src/context/AuthContext.jsx";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import { formatAdminDate } from "./adminUi.js";

const ROLES = ["admin", "manager", "cashier", "kitchen", "inventory", "storekeeper", "accountant"];
const EMPTY = { name: "", email: "", phone: "", role: "cashier", password: "" };
const inputClass = "h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60";

function Dialog({ title, open, onClose, children }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"><button type="button" className="absolute inset-0" aria-label="Close dialog" onClick={onClose} /><section role="dialog" aria-modal="true" aria-label={title} className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#101416] p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">{title}</h2><button type="button" onClick={onClose} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></button></div>{children}</section></div>;
}

export default function StaffManagement() {
  const { user } = useAuth();
  const canManage = user?.role === "admin";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [newPassword, setNewPassword] = useState("");

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchStaffAccounts()); }
    catch (error) { toast.error(error.response?.data?.message || "Unable to load staff accounts."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return !term ? rows : rows.filter((row) => [row.name, row.email, row.phone, row.role].some((value) => String(value || "").toLowerCase().includes(term)));
  }, [query, rows]);

  const openCreate = () => { setEditing({ create: true }); setForm(EMPTY); };
  const openEdit = (row) => { setEditing(row); setForm({ name: row.name, email: row.email, phone: row.phone || "", role: row.role, password: "" }); };
  const save = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      if (editing.create) await createStaffAccount(form);
      else await updateStaffAccount(editing._id, { name: form.name, email: form.email, phone: form.phone, role: form.role });
      toast.success(editing.create ? "Staff account created." : "Staff account updated. Role changes revoke previous sessions.");
      setEditing(null); await load();
    } catch (error) { toast.error(error.response?.data?.message || "Unable to save staff account."); }
    finally { setSaving(false); }
  };
  const toggle = async (row) => {
    const active = row.isActive === false;
    if (!window.confirm(`${active ? "Reactivate" : "Deactivate"} ${row.name}?${active ? "" : " Their existing sessions will be revoked."}`)) return;
    try { await setStaffAccountActive(row._id, active); toast.success(active ? "Staff account reactivated." : "Staff account deactivated."); await load(); }
    catch (error) { toast.error(error.response?.data?.message || "Unable to update staff access."); }
  };
  const resetPassword = async (event) => {
    event.preventDefault(); setSaving(true);
    try { await resetStaffAccountPassword(resetting._id, newPassword); toast.success("Password updated and previous sessions revoked."); setResetting(null); setNewPassword(""); }
    catch (error) { toast.error(error.response?.data?.message || "Unable to reset the password."); }
    finally { setSaving(false); }
  };

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search staff…" className={`${inputClass} pl-9`} /></div>{canManage ? <button type="button" onClick={openCreate} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-dune-amber px-4 text-sm font-semibold text-black"><Plus className="h-4 w-4" />Add staff</button> : <p className="text-xs text-neutral-500">Manager access is read-only.</p>}</div>
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-white/[0.07] text-xs text-neutral-500"><tr><th className="px-4 py-3">Staff</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Created</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-white/[0.055]">{visible.map((row) => <tr key={row._id} className="hover:bg-white/[0.025]"><td className="px-4 py-3 font-medium text-white">{row.name}</td><td className="px-3 py-3"><span className="block text-neutral-300">{row.email}</span><span className="text-xs text-neutral-500">{row.phone || "No phone"}</span></td><td className="px-3 py-3 capitalize text-neutral-300">{row.role}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs ${row.isActive === false ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"}`}>{row.isActive === false ? "Inactive" : "Active"}</span></td><td className="px-3 py-3 text-xs text-neutral-500">{formatAdminDate(row.createdAt)}</td><td className="px-4 py-3"><div className="flex justify-end gap-1">{canManage && <><button type="button" onClick={() => openEdit(row)} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white" aria-label={`Edit ${row.name}`}><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => { setResetting(row); setNewPassword(""); }} className="rounded-lg p-2 text-neutral-500 hover:bg-amber-500/10 hover:text-amber-300" aria-label={`Reset password for ${row.name}`}><KeyRound className="h-4 w-4" /></button><button type="button" onClick={() => toggle(row)} className={`rounded-lg p-2 ${row.isActive === false ? "text-emerald-400 hover:bg-emerald-500/10" : "text-red-400 hover:bg-red-500/10"}`} aria-label={`${row.isActive === false ? "Reactivate" : "Deactivate"} ${row.name}`}><Power className="h-4 w-4" /></button></>}</div></td></tr>)}</tbody></table></div>{loading && <p className="px-4 py-10 text-center text-sm text-neutral-500">Loading staff accounts…</p>}{!loading && !visible.length && <p className="px-4 py-10 text-center text-sm text-neutral-500">No matching staff accounts.</p>}</div>
    <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.create ? "Add staff account" : "Edit staff account"}><form onSubmit={save} className="space-y-4">{[["Name", "name", "text"], ["Email", "email", "email"], ["Phone", "phone", "tel"]].map(([label, key, type]) => <label key={key} className="block text-sm text-neutral-300">{label}<input required={key !== "phone"} type={type} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className={`${inputClass} mt-2`} /></label>)}<label className="block text-sm text-neutral-300">Role<DarkSelect value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className={`${inputClass} mt-2`}>{ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</DarkSelect></label>{editing?.create && <label className="block text-sm text-neutral-300">Temporary password<input required type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className={`${inputClass} mt-2`} /><span className="mt-1 block text-xs text-neutral-500">At least 10 characters with uppercase, lowercase, number and symbol.</span></label>}<button type="submit" disabled={saving} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-dune-amber font-semibold text-black disabled:opacity-50">{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}{editing?.create ? "Create staff" : "Save changes"}</button></form></Dialog>
    <Dialog open={Boolean(resetting)} onClose={() => setResetting(null)} title={`Reset password · ${resetting?.name || ""}`}><form onSubmit={resetPassword} className="space-y-4"><p className="text-sm text-neutral-400">Saving a new password immediately revokes this staff member&apos;s previous sessions.</p><label className="block text-sm text-neutral-300">New temporary password<input required type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={`${inputClass} mt-2`} /><span className="mt-1 block text-xs text-neutral-500">At least 10 characters with uppercase, lowercase, number and symbol.</span></label><button type="submit" disabled={saving} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-dune-amber font-semibold text-black disabled:opacity-50">{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}Reset password</button></form></Dialog>
  </div>;
}

