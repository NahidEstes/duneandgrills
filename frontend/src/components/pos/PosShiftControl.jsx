"use client";
import RecordId from "@/src/components/ui/RecordId.jsx";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Banknote, History, LoaderCircle, LockKeyhole, PlusCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { addPosCashMovement, closePosShift, fetchCurrentPosShift, fetchPosShift, fetchPosShifts, openPosShift, reopenPosShift, fetchPosCashiers } from "@/src/api/api.js";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import PosShiftPrintSummary from "./PosShiftPrintSummary.jsx";
import usePosDialog from "@/src/hooks/usePosDialog.js";

const amount = (value) => `SAR ${Number(value || 0).toFixed(2)}`;
const message = (error) => error.response?.data?.message || "Unable to update POS shift.";

export default function PosShiftControl({ user, terminal, locked = false, onShiftChange }) {
  const [state, setState] = useState({ loading: true, config: { enabled: false }, data: null });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialog = usePosDialog(open && !locked, () => { if (!busy) setOpen(false); });
  const [openingCash, setOpeningCash] = useState("0");
  const [openingNote, setOpeningNote] = useState("");
  const [managers, setManagers] = useState([]);
  const [approval, setApproval] = useState({ managerId: "", managerPin: "" });
  const [acknowledge, setAcknowledge] = useState(false);
  const [denominations, setDenominations] = useState({});
  const requestKeys = useRef({});
  const keyFor = (type, payload) => { const fingerprint = JSON.stringify(payload); if (requestKeys.current[type]?.fingerprint !== fingerprint) requestKeys.current[type] = { fingerprint, key: crypto.randomUUID() }; return requestKeys.current[type].key; };
  const [movement, setMovement] = useState({ type: "cash_in", amount: "", reason: "" });
  const [closing, setClosing] = useState({ countedCash: "", note: "" });
  const [history, setHistory] = useState([]);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [reopenReason, setReopenReason] = useState("");
  const load = useCallback(async () => {
    try { const response = await fetchCurrentPosShift(terminal); setState({ loading: false, config: response.config || { enabled: false }, data: response.data }); onShiftChange?.(Boolean(response.data?.shift)); }
    catch (error) { setState((current) => ({ ...current, loading: false })); toast.error(message(error)); }
  }, [terminal, onShiftChange]);
  useEffect(() => { load(); fetchPosCashiers().then(rows => setManagers(rows.filter(row => ["manager", "admin"].includes(row.role)))).catch(() => undefined); }, [load]);
  const act = async (operation, success) => {
    setBusy(true);
    try { await operation(); toast.success(success); await load(); }
    catch (error) { toast.error(message(error)); }
    finally { setBusy(false); }
  };
  const recordMovement = () => act(async () => {
    await addPosCashMovement(state.data.shift._id, { ...movement, amount: Number(movement.amount), idempotencyKey: keyFor("cash", movement) });
    delete requestKeys.current.cash;
    setMovement({ type: "cash_in", amount: "", reason: "" });
  }, "Cash movement recorded.");
  if (state.loading) return <span className="hidden text-xs text-neutral-500 md:inline">Loading shift…</span>;
  if (!state.config.enabled) return null;
  const shift = state.data?.shift;
  return <div className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm ${shift ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-dune-amber"}`}><Banknote className="h-4 w-4" />{shift ? "Shift Open" : "Open Shift"}</button>
    {open && !locked && createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4" onClick={() => { if (!busy) setOpen(false); }}><section ref={dialog} role="dialog" aria-modal="true" aria-label="POS shift management" tabIndex={-1} onClick={(event) => event.stopPropagation()} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0d1214] p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-dune-amber">POS Shift · {terminal}</p><h2 className="mt-1 text-xl font-semibold text-white">{shift ? `${user.name}'s active shift` : "Open cashier shift"}</h2>{shift && <RecordId value={shift.shiftNumber} />}</div><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Close</button></div>
      {!shift ? <div className="mt-5 space-y-4"><label className="block text-xs text-neutral-400">Opening cash (SAR)<input type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-white outline-none focus:border-dune-amber" /></label><label className="block text-xs text-neutral-400">Opening note<input value={openingNote} maxLength={500} onChange={event => setOpeningNote(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3" /></label><button disabled={busy} type="button" onClick={() => act(() => openPosShift({ terminal, openingCash: Number(openingCash), openingNote }), "Shift opened." )} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-dune-amber font-semibold text-black disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}Open Shift</button></div> : <>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.entries(state.data.totals || {}).map(([key, value]) => <div key={key} className="rounded-xl border border-white/[0.07] bg-black/20 p-3"><p className="text-[0.65rem] capitalize text-neutral-500">{key.replace(/([A-Z])/g, " $1")}</p><p className="mt-1 text-sm font-semibold text-white">{amount(value)}</p></div>)}</div>
        <div className="mt-5 rounded-xl border border-white/10 p-4">
          <p className="text-sm font-semibold text-white">Cash In / Out</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <DarkSelect aria-label="Cash movement type" value={movement.type} onChange={event => setMovement({ ...movement, type: event.target.value })} className="h-10 rounded-lg border border-white/10 bg-[#111719] px-3 text-sm"><option value="cash_in">Cash In</option><option value="cash_out">Cash Out</option><option value="payout">Payout</option></DarkSelect>
            <input aria-label="Cash movement amount" type="number" min="0.01" step="0.01" value={movement.amount} onChange={event => setMovement({ ...movement, amount: event.target.value })} placeholder="Amount SAR" className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm" />
            <input aria-label="Cash movement reason" maxLength={500} value={movement.reason} onChange={event => setMovement({ ...movement, reason: event.target.value })} placeholder="Reason required" className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm" />
          </div>
          <button disabled={busy || !movement.reason.trim() || Number(movement.amount) <= 0} type="button" onClick={recordMovement} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dune-amber/40 px-3 py-2 text-xs text-dune-amber disabled:opacity-40"><PlusCircle className="h-4 w-4" />Record Movement</button>
        </div>
        <div className="mt-4 rounded-xl border border-red-500/20 p-4"><p className="text-sm font-semibold text-white">Close Shift</p>{state.config.blindClose && state.data.totals?.expectedCash === undefined && <p className="mt-1 text-xs text-amber-300">Blind close is enabled. Expected cash is hidden until closing.</p>}<div className="mt-3 grid gap-2 sm:grid-cols-2"><input type="number" min="0" step="0.01" value={closing.countedCash} onChange={(event) => setClosing({ ...closing, countedCash: event.target.value })} placeholder="Counted cash SAR" className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm" /><input value={closing.note} onChange={(event) => setClosing({ ...closing, note: event.target.value })} placeholder="Difference / closing note" className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm" /></div><details className="mt-3 rounded-xl border border-white/10 p-3"><summary className="cursor-pointer text-xs text-dune-amber">Denomination count helper</summary><div className="mt-3 grid grid-cols-3 gap-2">{[500, 200, 100, 50, 20, 10, 5, 1, 0.5, 0.25].map(value => <label key={value} className="text-xs text-neutral-400">SAR {value}<input type="number" min="0" step="1" value={denominations[value] || ""} onChange={event => { const counts = { ...denominations, [value]: Math.max(0, Math.floor(Number(event.target.value) || 0)) }; setDenominations(counts); setClosing(current => ({ ...current, countedCash: (Object.entries(counts).reduce((sum, [unit, count]) => sum + Math.round(Number(unit) * 100) * count, 0) / 100).toFixed(2) })); }} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2" /></label>)}</div></details>
<label className="mt-3 flex gap-2 text-xs text-neutral-400"><input type="checkbox" checked={acknowledge} onChange={event => setAcknowledge(event.target.checked)} className="accent-orange-500" />I acknowledge unfinished/held sales; preserve them after closing.</label>
{!["admin", "manager"].includes(user.role) && <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs text-neutral-400">Variance approver<DarkSelect value={approval.managerId} onChange={event => setApproval({ ...approval, managerId: event.target.value })} className="mt-1 min-h-10 rounded-lg border border-white/10 bg-black/30 px-3"><option value="">Manager approval if required</option>{managers.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</DarkSelect></label><label className="text-xs text-neutral-400">Manager POS PIN<input type="password" autoComplete="off" inputMode="numeric" maxLength={6} value={approval.managerPin} onChange={event => setApproval({ ...approval, managerPin: event.target.value.replace(/\D/g, "") })} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3" /></label></div>}
<button disabled={busy || closing.countedCash === ""} type="button" onClick={() => act(async () => { try { const closed = await closePosShift(shift._id, { countedCash: Number(closing.countedCash), note: closing.note, idempotencyKey: keyFor("close", { ...closing, acknowledge }), ...approval, acknowledgeOpenSales: acknowledge }); delete requestKeys.current.close; setClosing({ countedCash: "", note: "" }); setDenominations({}); setAcknowledge(false); setSelectedHistory(await fetchPosShift(closed._id)); } finally { setApproval({ managerId: "", managerPin: "" }); } }, "Shift closed." )} className="mt-3 rounded-lg bg-red-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Close Shift</button></div>
      </>}
      {state.data?.movements?.length > 0 && <details className="mt-4 rounded-xl border border-white/10 p-3 text-xs"><summary className="cursor-pointer text-dune-amber">Cash movement history</summary><div className="mt-2 max-h-48 overflow-y-auto">{state.data.movements.map(row => <div key={row._id} className="flex flex-wrap justify-between gap-2 py-2"><RecordId value={row.movementNumber} /><span>{row.type} · {amount(row.amountHalala / 100)}</span></div>)}</div></details>}
      {!["admin", "manager"].includes(user.role) && <PosShiftPrintSummary data={selectedHistory} canReopen={false} />}{["admin", "manager"].includes(user.role) && <div className="mt-4 border-t border-white/10 pt-4">
        <button type="button" onClick={async () => { try { const result = await fetchPosShifts({ limit: 10 }); setHistory(result.data || []); } catch (error) { toast.error(message(error)); } }} className="inline-flex items-center gap-2 text-xs text-neutral-300"><History className="h-4 w-4" />Load recent shifts</button>
        {history.length > 0 && <div className="mt-3 space-y-2">{history.map((row) => <button type="button" onClick={async () => { try { setSelectedHistory(await fetchPosShift(row._id)); } catch (error) { toast.error(message(error)); } }} key={row._id} className="flex w-full items-center justify-between rounded-lg bg-black/20 p-3 text-left text-xs hover:bg-white/[0.05]"><span>{row.shiftNumber} · {row.cashier?.name} · {row.terminal}<br /><span className="text-neutral-600">{new Date(row.openedAt).toLocaleString()}</span></span><span className="capitalize text-neutral-300">{row.status}{row.differenceHalala != null ? ` · ${amount(row.differenceHalala / 100)}` : ""}</span></button>)}</div>}
        <PosShiftPrintSummary data={selectedHistory} busy={busy} reopenReason={reopenReason} onReasonChange={setReopenReason} onReopen={() => act(async () => { await reopenPosShift(selectedHistory.shift._id, reopenReason); setSelectedHistory(null); setReopenReason(""); }, "Shift reopened.")} />
      </div>}
      <button type="button" onClick={load} className="mt-4 inline-flex items-center gap-2 text-xs text-neutral-500"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
    </section></div>, document.body)}
  </div>;
}
