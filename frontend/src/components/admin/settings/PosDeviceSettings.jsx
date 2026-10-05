"use client";

import { useCallback, useEffect, useState } from "react";
import { Monitor, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { fetchPosTerminals, savePosTerminal, fetchPosCashiers, setPosStaffPin } from "@/src/api/api.js";
import { useAuth } from "@/src/context/AuthContext.jsx";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import { SettingsCard, Field, settingsInputClass } from "./settingsUi.jsx";

export default function PosDeviceSettings() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]); const [cashiers, setCashiers] = useState([]);
  const [form, setForm] = useState({ code: "", name: "", locationLabel: "", isActive: true });
  const [id, setId] = useState(""); const [busy, setBusy] = useState(false);
  const [cashierId, setCashierId] = useState(""); const [pin, setPin] = useState(""); const [error, setError] = useState("");
  const load = useCallback(async () => { try { setRows(await fetchPosTerminals(true)); if (user?.role === "admin") setCashiers(await fetchPosCashiers()); setError(""); } catch (failure) { setError(failure.response?.data?.message || "Unable to load POS devices."); } }, [user]);
  useEffect(() => { load(); }, [load]);
  const save = async () => { setBusy(true); try { await savePosTerminal(form, id || undefined); setId(""); setForm({ code: "", name: "", locationLabel: "", isActive: true }); await load(); toast.success("POS terminal saved."); } catch (failure) { toast.error(failure.response?.data?.message || "Unable to save terminal."); } finally { setBusy(false); } };
  return <div className="space-y-4"><SettingsCard icon={Monitor} title="POS Terminals" description="Create cashier devices and preserve their historical identity.">
    {error && <p role="alert" className="mb-3 text-sm text-red-400">{error}<button type="button" onClick={load} className="ml-3 text-dune-amber">Retry</button></p>}
    <div className="mb-4 space-y-2">{rows.map(row => <div key={row._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-3 text-sm"><span>{row.name} <span className="text-neutral-500">· {row.code} · {row.isActive ? "Active" : "Inactive"}</span></span><button type="button" onClick={() => { setId(row._id); setForm({ code: row.code, name: row.name, locationLabel: row.locationLabel, isActive: row.isActive }); }} className="text-dune-amber">Edit</button></div>)}</div>
    <div className="grid gap-3 sm:grid-cols-3">{[["code", "Terminal code"], ["name", "Display name"], ["locationLabel", "Location label"]].map(([key, label]) => <Field key={key} label={label}><input value={form[key]} readOnly={key === "code" && Boolean(id)} maxLength={key === "code" ? 40 : key === "name" ? 100 : 120} onChange={event => setForm({ ...form, [key]: event.target.value })} className={`${settingsInputClass} mt-2`} /></Field>)}</div>
    <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} className="accent-orange-500" />Active</label>
    <div className="mt-4 flex gap-3"><button type="button" disabled={busy || !form.name.trim() || !form.code.trim()} onClick={save} className="rounded-xl bg-dune-amber px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">{busy ? "Saving…" : id ? "Update terminal" : "Add terminal"}</button>{id && <button type="button" onClick={() => { setId(""); setForm({ code: "", name: "", locationLabel: "", isActive: true }); }}>Cancel</button>}</div>
  </SettingsCard>
  {user?.role === "admin" && <SettingsCard icon={LockKeyhole} title="POS Staff PINs" description="Dedicated 4–6 digit POS PINs. Changing a PIN locks POS sessions and requires the staff member to sign in again.">
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Staff member"><DarkSelect value={cashierId} onChange={event => setCashierId(event.target.value)} className={`${settingsInputClass} mt-2`}><option value="">Select POS staff</option>{cashiers.map(row => <option key={row._id} value={row._id}>{row.name} · {row.role}</option>)}</DarkSelect></Field><Field label="New POS PIN"><input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} className={`${settingsInputClass} mt-2`} /></Field></div>
    <button type="button" disabled={busy || !cashierId || pin.length < 4} onClick={async () => { setBusy(true); try { await setPosStaffPin(cashierId, pin); setPin(""); toast.success("POS PIN updated. Ask staff to sign in again."); } catch (failure) { toast.error(failure.response?.data?.message || "Unable to set PIN."); } finally { setBusy(false); } }} className="mt-4 rounded-xl border border-dune-amber/30 px-4 py-2 text-sm text-dune-amber disabled:opacity-50">Set POS PIN</button>
  </SettingsCard>}</div>;
}
