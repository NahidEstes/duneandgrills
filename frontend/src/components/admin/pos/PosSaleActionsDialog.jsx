"use client";
import RecordId from "@/src/components/ui/RecordId.jsx";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { requestPosRefund, transitionPosRefund, voidPosSale } from "@/src/api/api.js";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import { formatAdminCurrency } from "../adminUi.js";
import usePosDialog from "@/src/hooks/usePosDialog.js";
import { printPosRefundRecord } from "@/src/utils/adminExports.js";

const inputClass = "min-h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-dune-amber";
export default function PosSaleActionsDialog({ data, canManage, onClose, onRefresh, onReceipt, onRepeat }) {
  const sale = data.data; const refunds = data.refunds;
  const [reason, setReason] = useState(""); const [amount, setAmount] = useState(String(refunds.remainingRefundableAmount));
  const [mode, setMode] = useState("amount"); const [method, setMethod] = useState(sale.paymentMethod);
  const [reference, setReference] = useState(""); const [quantities, setQuantities] = useState({});
  const [restock, setRestock] = useState(false); const [busy, setBusy] = useState(false);
  const [voidRestock, setVoidRestock] = useState(false);
  const dialog = usePosDialog(true, () => { if (!busy) onClose(); });
  const requestKey = useRef({});
  const keyFor = (type, payload) => {
    const fingerprint = JSON.stringify({ type, payload });
    if (requestKey.current.fingerprint !== fingerprint) requestKey.current = { fingerprint, key: crypto.randomUUID() };
    return requestKey.current.key;
  };
  const act = async (operation, success) => {
    setBusy(true); try { await operation(); toast.success(success); requestKey.current = {}; await onRefresh(); }
    catch (error) { toast.error(error.response?.data?.message || "Unable to update sale."); } finally { setBusy(false); }
  };
  const requestRefund = () => {
    const payload = { reason, amount: Number(amount), method, externalReference: reference, items: mode === "items" ? Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([index, quantity]) => ({ index: Number(index), quantity })) : [], restock };
    if (window.confirm("Create this refund request for manager approval?")) act(() => requestPosRefund(sale._id, { ...payload, idempotencyKey: keyFor("refund", payload) }), "Refund request created.");
  };
  const requestVoid = () => {
    const payload = { reason, restock: voidRestock };
    if (window.confirm(`Void this sale? ${voidRestock ? "Restore all physically returned ingredient allocations." : "Keep stock deducted — no restock."}`)) act(() => voidPosSale(sale._id, { ...payload, idempotencyKey: keyFor("void", payload) }), "Sale voided.");
  };
  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/80 p-4"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="pos-history-detail-title" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#101618] p-5 shadow-2xl">
    <div className="flex items-start justify-between gap-3"><div><h2 id="pos-history-detail-title" className="text-xl font-semibold">Sale #{sale.orderNumber}</h2><p className="mt-1 text-sm capitalize text-neutral-400">{sale.status} · {sale.paymentStatus.replaceAll("_", " ")} · {sale.terminalSnapshot?.name || sale.terminal || "MAIN"}</p></div><button type="button" onClick={onClose} className="rounded-lg border border-white/10 p-2" aria-label="Close sale details">✕</button></div>
    <div className="mt-5 space-y-3">{sale.items.map((line, index) => <div key={index} className="flex justify-between gap-3 border-b border-white/5 pb-3 text-sm"><div><p>{line.name} ×{line.quantity}</p><p className="mt-1 text-xs text-neutral-500">{(line.selectedAddOns || []).map(add => `${add.name} ×${add.quantity}`).join(", ")}{line.spiceLevel ? ` · ${line.spiceLevel}` : ""}{line.itemNote ? ` · ${line.itemNote}` : ""}</p></div><span className="shrink-0 text-dune-amber">{formatAdminCurrency(line.price * line.quantity)}</span></div>)}</div>
    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3"><p>Total: <strong>{formatAdminCurrency(sale.totalAmount)}</strong></p><p>Refunded: <strong>{formatAdminCurrency(refunds.completedRefundAmount)}</strong></p><p>Refundable: <strong>{formatAdminCurrency(refunds.remainingRefundableAmount)}</strong></p></div>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onReceipt} className="min-h-11 rounded-xl border border-dune-amber/30 px-4 text-sm text-dune-amber">Receipt reprint</button><button type="button" onClick={() => { onRepeat(sale); onClose(); }} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm">Add items to new sale</button></div>
    {refunds.refunds.length > 0 && <div className="mt-5 space-y-2"><h3 className="text-sm font-semibold">Refund records</h3>{refunds.refunds.map(row => <div key={row._id} className="rounded-xl border border-white/10 p-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><span><RecordId value={row.refundNumber} /> · {formatAdminCurrency(row.amount)} · {row.method} · {row.status}</span><span className="text-xs text-neutral-500">{row.externalReference}</span></div>
      <p className="mt-1 text-xs text-neutral-400">{row.reason} · {row.restock ? "Returned stock restored on completion" : "No stock return"}</p>
      <button type="button" onClick={() => printPosRefundRecord(sale, row)} className="mt-2 min-h-10 text-xs text-neutral-300">Print refund record (not a fiscal credit note)</button>
      {canManage && <div className="mt-2 flex flex-wrap gap-3">
        {row.status === "requested" && <button type="button" disabled={busy} onClick={() => act(() => transitionPosRefund(row._id, "approve"), "Refund approved.")} className="text-dune-amber">Approve</button>}
        {["approved", "processing"].includes(row.status) && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Confirm the manual ${row.method} refund has been paid?${row.method === "card" ? " Complete it on the external card terminal first." : ""}`)) act(() => transitionPosRefund(row._id, "complete", { externalReference: reference || row.externalReference }), "Refund recorded as completed."); }} className="text-emerald-400">Record completed payment</button>}
        {["requested", "approved"].includes(row.status) && <button type="button" disabled={busy} onClick={() => act(() => transitionPosRefund(row._id, "cancel", { reason: "Cancelled by manager" }), "Refund request cancelled.")} className="text-red-400">Cancel request</button>}
      </div>}
    </div>)}</div>}
    {canManage && ["paid", "partially_refunded"].includes(sale.paymentStatus) && <div className="mt-5 space-y-3 border-t border-white/10 pt-5"><h3 className="font-semibold">Void / manual refund</h3>
      <label className="block text-xs text-neutral-400">Reason<input maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className={`${inputClass} mt-2`} /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-neutral-400">Refund selection<DarkSelect value={mode} onChange={event => { setMode(event.target.value); setRestock(false); }} className={`${inputClass} mt-2`}><option value="amount">Full / partial amount</option><option value="items">Item quantities</option></DarkSelect></label><label className="text-xs text-neutral-400">Manual method<DarkSelect value={method} onChange={event => setMethod(event.target.value)} className={`${inputClass} mt-2`}>{["cash", "card", "other"].map(value => <option key={value} value={value}>{value}</option>)}</DarkSelect></label></div>
      {mode === "amount" ? <label className="block text-xs text-neutral-400">Refund amount (SAR)<input type="number" min="0.01" max={refunds.remainingRefundableAmount} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className={`${inputClass} mt-2`} /></label> : <div className="space-y-2">{sale.items.map((line, index) => <label key={index} className="flex items-center justify-between gap-3 text-sm"><span>{line.name} (original: {line.quantity})</span><input aria-label={`Refund quantity for ${line.name}`} type="number" min="0" max={line.quantity} step="1" value={quantities[index] || ""} onChange={event => setQuantities({ ...quantities, [index]: Number(event.target.value) })} className={`${inputClass} max-w-24`} /></label>)}<label className="flex items-start gap-2 text-sm text-neutral-400"><input type="checkbox" checked={restock} onChange={event => setRestock(event.target.checked)} className="mt-1 accent-orange-500" />Returned items physically went back into usable stock</label></div>}
      <label className="block text-xs text-neutral-400">External/manual payment reference<input value={reference} maxLength={160} onChange={event => setReference(event.target.value)} className={`${inputClass} mt-2`} /></label>{method === "card" && <p className="text-xs text-amber-300">Complete the card refund on the external card terminal, then record its reference.</p>}
      {sale.paymentStatus === "paid" && <label className="flex items-start gap-2 text-sm text-neutral-400"><input type="checkbox" checked={voidRestock} onChange={event => setVoidRestock(event.target.checked)} className="mt-1 accent-orange-500" />For void only: ALL items physically returned to usable stock</label>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || reason.trim().length < 3} onClick={requestRefund} className="min-h-11 rounded-xl bg-dune-amber px-4 text-sm font-semibold text-black disabled:opacity-40">Request refund</button>
      {sale.paymentStatus === "paid" && <button type="button" disabled={busy || reason.trim().length < 3} onClick={requestVoid} className="min-h-11 rounded-xl border border-red-500/30 px-4 text-sm text-red-400 disabled:opacity-40">Void sale</button>}</div>
    </div>}
  </section></div>;
}
