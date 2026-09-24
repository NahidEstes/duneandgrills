"use client";

import { Printer, RotateCcw } from "lucide-react";

const money = (value) => `SAR ${Number(value || 0).toFixed(2)}`;

export default function PosShiftPrintSummary({ data, busy, reopenReason, onReasonChange, onReopen }) {
  if (!data?.shift) return null;
  const { shift, totals = {} } = data;
  const printSummary = () => {
    document.body.classList.add("printing-pos-shift");
    window.addEventListener("afterprint", () => document.body.classList.remove("printing-pos-shift"), { once: true });
    window.print();
  };
  return <section className="pos-shift-printable mt-4 rounded-xl border border-white/10 bg-[#090d0f] p-4">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-dune-amber">Shift closing summary</p><p className="mt-1 font-semibold text-white">{shift.cashier?.name} · {shift.terminal}</p><p className="text-xs text-neutral-500">{new Date(shift.openedAt).toLocaleString()} — {shift.closedAt ? new Date(shift.closedAt).toLocaleString() : "Open"}</p></div>
      <button type="button" onClick={printSummary} className="pos-shift-no-print inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs"><Printer className="h-3.5 w-3.5" />Print</button>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">{Object.entries(totals).map(([key, value]) => <div key={key} className="rounded-lg border border-white/[0.07] p-2"><p className="text-[0.65rem] capitalize text-neutral-500">{key.replace(/([A-Z])/g, " $1")}</p><p className="text-sm font-semibold text-white">{money(value)}</p></div>)}</div>
    {shift.closingNote && <p className="mt-3 text-xs text-neutral-400"><span className="text-neutral-600">Closing note:</span> {shift.closingNote}</p>}
    {shift.status === "closed" && <div className="pos-shift-no-print mt-3 flex gap-2"><input value={reopenReason} onChange={(event) => onReasonChange(event.target.value)} placeholder="Manager reopen reason" className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-xs" /><button disabled={busy || !reopenReason.trim()} type="button" onClick={onReopen} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 text-xs text-dune-amber disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" />Reopen</button></div>}
  </section>;
}
