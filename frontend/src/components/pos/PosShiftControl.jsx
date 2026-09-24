"use client";

import { useEffect, useState } from "react";
import { Banknote, History, LoaderCircle, LockKeyhole, PlusCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { addPosCashMovement, closePosShift, fetchCurrentPosShift, fetchPosShift, fetchPosShifts, openPosShift, reopenPosShift } from "@/src/api/api.js";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import PosShiftPrintSummary from "./PosShiftPrintSummary.jsx";

const amount = (value) => `SAR ${Number(value || 0).toFixed(2)}`;
const message = (error) => error.response?.data?.message || "Unable to update POS shift.";

export default function PosShiftControl({ user }) {
  const [state, setState] = useState({ loading: true, config: { enabled: false }, data: null });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [movement, setMovement] = useState({ type: "cash_in", amount: "", reason: "" });
  const [closing, setClosing] = useState({ countedCash: "", note: "" });
  const [history, setHistory] = useState([]);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [reopenReason, setReopenReason] = useState("");
  const terminal = "MAIN";

  const load = async () => {
    try { const response = await fetchCurrentPosShift(terminal); setState({ loading: false, config: response.config || { enabled: false }, data: response.data }); }
    catch (error) { setState((current) => ({ ...current, loading: false })); toast.error(message(error)); }
  };
  useEffect(() => { load(); }, []);
  const act = async (operation, success) => {
    setBusy(true);
    try { await operation(); toast.success(success); await load(); }
    catch (error) { toast.error(message(error)); }
    finally { setBusy(false); }
  };
  if (state.loading) return <span className="hidden text-xs text-neutral-500 md:inline">Loading shift…</span>;
  if (!state.config.enabled) return null;
  const shift = state.data?.shift;
  return <div className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm ${shift ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-dune-amber"}`}><Banknote className="h-4 w-4" />{shift ? "Shift Open" : "Open Shift"}</button>
    {open && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4" onClick={() => setOpen(false)}><section onClick={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0d1214] p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-dune-amber">POS Shift · {terminal}</p><h2 className="mt-1 text-xl font-semibold text-white">{shift ? `${user.name}'s active shift` : "Open cashier shift"}</h2></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Close</button></div>
      {!shift ? <div className="mt-5 space-y-4"><label className="block text-xs text-neutral-400">Opening cash (SAR)<input type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-white outline-none focus:border-dune-amber" /></label><button disabled={busy} type="button" onClick={() => act(() => openPosShift({ terminal, openingCash: Number(openingCash) }), "Shift opened." )} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-dune-amber font-semibold text-black disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}Open Shift</button></div> : <>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.entries(state.data.totals || {}).map(([key, value]) => <div key={key} className="rounded-xl border border-white/[0.07] bg-black/20 p-3"><p className="text-[0.65rem] capitalize text-neutral-500">{key.replace(/([A-Z])/g, " $1")}</p><p className="mt-1 text-sm font-semibold text-white">{amount(value)}</p></div>)}</div>
        <div className="mt-5 rounded-xl border border-white/10 p-4"><p className="text-sm font-semibold text-white">Cash In / Out</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><DarkSelect value={movement.type} onChange={(event) => setMovement({ ...movement, type: event.target.value })} className="h-10 rounded-lg border border-white/10 bg-[#111719] px-3 text-sm"><option value="cash_in">Cash In</option><option value="cash_out">Cash Out</option><option value="payout">Payout</option></DarkSelect><input type="number" min="0.01" step="0.01" value={movement.amount} onChange={(event) => setMovement({ ...movement, amount: event.target.value })} placeholder="Amount SAR" className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm" /><input value={movement.reason} onChange={(event) => setMovement({ ...movement, reason: event.target.value })} placeholder="Reason required" className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm" /></div><button disabled={busy} type="button" onClick={() => act(() => addPosCashMovement(shift._id, { ...movement, amount: Number(movement.amount) }), "Cash movement recorded.")} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dune-amber/40 px-3 py-2 text-xs text-dune-amber"><PlusCircle className="h-4 w-4" />Record Movement</button></div>
        <div className="mt-4 rounded-xl border border-red-500/20 p-4"><p className="text-sm font-semibold text-white">Close Shift</p>{state.config.blindClose && state.data.totals?.expectedCash === undefined && <p className="mt-1 text-xs text-amber-300">Blind close is enabled. Expected cash is hidden until closing.</p>}<div className="mt-3 grid gap-2 sm:grid-cols-2"><input type="number" min="0" step="0.01" value={closing.countedCash} onChange={(event) => setClosing({ ...closing, countedCash: event.target.value })} placeholder="Counted cash SAR" className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm" /><input value={closing.note} onChange={(event) => setClosing({ ...closing, note: event.target.value })} placeholder="Difference / closing note" className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm" /></div><button disabled={busy || closing.countedCash === ""} type="button" onClick={() => act(() => closePosShift(shift._id, { countedCash: Number(closing.countedCash), note: closing.note, idempotencyKey: crypto.randomUUID() }), "Shift closed." )} className="mt-3 rounded-lg bg-red-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Close Shift</button></div>
      </>}
      {["admin", "manager"].includes(user.role) && <div className="mt-4 border-t border-white/10 pt-4">
        <button type="button" onClick={async () => { try { const result = await fetchPosShifts({ limit: 10 }); setHistory(result.data || []); } catch (error) { toast.error(message(error)); } }} className="inline-flex items-center gap-2 text-xs text-neutral-300"><History className="h-4 w-4" />Load recent shifts</button>
        {history.length > 0 && <div className="mt-3 space-y-2">{history.map((row) => <button type="button" onClick={async () => { try { setSelectedHistory(await fetchPosShift(row._id)); } catch (error) { toast.error(message(error)); } }} key={row._id} className="flex w-full items-center justify-between rounded-lg bg-black/20 p-3 text-left text-xs hover:bg-white/[0.05]"><span>{row.cashier?.name} · {row.terminal}<br /><span className="text-neutral-600">{new Date(row.openedAt).toLocaleString()}</span></span><span className="capitalize text-neutral-300">{row.status}{row.differenceHalala != null ? ` · ${amount(row.differenceHalala / 100)}` : ""}</span></button>)}</div>}
        <PosShiftPrintSummary data={selectedHistory} busy={busy} reopenReason={reopenReason} onReasonChange={setReopenReason} onReopen={() => act(async () => { await reopenPosShift(selectedHistory.shift._id, reopenReason); setSelectedHistory(null); setReopenReason(""); }, "Shift reopened.")} />
      </div>}
      <button type="button" onClick={load} className="mt-4 inline-flex items-center gap-2 text-xs text-neutral-500"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
    </section></div>}
  </div>;
}
