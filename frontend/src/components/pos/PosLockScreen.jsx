"use client";

import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { unlockPosSession } from "@/src/api/api.js";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";

export default function PosLockScreen({ user, onUnlock, cashiers = [], switching = false, onCancel }) {
  const [credential, setCredential] = useState("");
  const [passwordMode, setPasswordMode] = useState(false);
  const [cashierId, setCashierId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unlock = async (event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await unlockPosSession(passwordMode ? { password: credential } : { pin: credential, cashierId }, switching);
      setCredential(""); onUnlock(result.actor);
    } catch (failure) { setError(failure.response?.data?.message || "Unable to unlock. Check your connection."); setCredential(""); }
    finally { setBusy(false); }
  };
  return <div className="grid min-h-dvh place-items-center bg-[#070a0c] px-4 text-neutral-200"><form onSubmit={unlock} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101618] p-6 shadow-2xl">
    <LockKeyhole className="mb-4 h-8 w-8 text-dune-amber" /><h1 className="text-xl font-semibold text-white">{switching ? "Switch Cashier" : "POS locked"}</h1>
    <p className="mt-2 text-sm text-neutral-400">{switching ? "Choose the next cashier and verify their POS PIN." : `${user.name}, unlock to resume your sale.`}</p>
    <p className="mt-2 text-xs text-neutral-500">Your current sale is preserved.</p>
    {switching && <label className="mt-4 block text-sm">Cashier<DarkSelect value={cashierId} onChange={event => setCashierId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3"><option value="">Choose cashier</option>{cashiers.map(row => <option key={row._id} value={row._id}>{row.name} · {row.role}</option>)}</DarkSelect></label>}
    <label htmlFor="pos-unlock-credential" className="mt-5 block text-sm">{passwordMode ? "Account password" : "POS PIN"}</label>
    <input id="pos-unlock-credential" type="password" inputMode={passwordMode ? undefined : "numeric"} autoComplete="off" autoFocus required disabled={busy} maxLength={passwordMode ? 128 : 6} value={credential} onChange={event => setCredential(passwordMode ? event.target.value : event.target.value.replace(/\D/g, ""))} className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-center text-xl tracking-widest outline-none focus:border-dune-amber" />
    {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
    <button type="submit" disabled={busy || (switching && !cashierId)} className="mt-5 min-h-12 w-full rounded-xl bg-dune-amber font-semibold text-black disabled:opacity-50">{busy ? "Verifying…" : switching ? "Switch Cashier" : "Unlock POS"}</button>
    {!switching && <button type="button" onClick={() => { setPasswordMode(value => !value); setCredential(""); }} className="mt-4 text-xs text-neutral-400">{passwordMode ? "Use POS PIN" : "Use account password"}</button>}
    {switching && <button type="button" onClick={onCancel} className="mt-4 text-sm text-neutral-400">Cancel</button>}
  </form></div>;
}
