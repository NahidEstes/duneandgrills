"use client";

import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";
import { useRef, useState } from "react";
import { LoaderCircle, PackageCheck } from "lucide-react";
import { Button, Field, inputClass, textareaClass } from "./InventoryUI.jsx";
import { apiErrorMessage, formatQuantity } from "./inventoryUtils.js";
import { receiptCanBeCorrected, receiptStorageKey, receiptSubmission } from "./purchaseReceiptSubmission.js";

export default function PurchaseReceiptForm({ order, actor, policy = {}, onSubmit, submitting }) {
  const storageKey = receiptStorageKey(order._id, actor?._id);
  const [attempt, setAttempt] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) || "null"); } catch { return null; }
  });
  const receivable = order.items.filter(line => Number(line.receivedQuantity) < Number(line.quantity) || attempt?.items.some(row => String(row.lineId) === String(line._id)));
  const [lines, setLines] = useState(() => Object.fromEntries(receivable.map(line => {
    const saved = attempt?.items.find(row => String(row.lineId) === String(line._id));
    return [line._id, { selected: Boolean(saved), quantity: Number(line.quantity) - Number(line.receivedQuantity), brand: line.requestedBrand || "", lotNumber: "", receivedAt: "", expiryDate: line.expiryDate ? new Date(line.expiryDate).toISOString().slice(0, 10) : "", notes: "", overrideReason: "", ...saved }];
  })));
  const [notes, setNotes] = useState(attempt?.notes || "");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const manager = ["admin", "manager"].includes(actor?.role);
  const locked = Boolean(attempt) || submitting;
  const set = (id, field, value) => setLines(current => ({ ...current, [id]: { ...current[id], [field]: value } }));
  const submit = async event => {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setError("");
    try {
      const payload = attempt || receiptSubmission(lines, notes, crypto.randomUUID());
      // Persist before sending: reopening after an ambiguous timeout retries the SAME payload/key.
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
      setAttempt(payload);
      await onSubmit(payload);
      sessionStorage.removeItem(storageKey);
      setAttempt(null);
    } catch (failure) {
      setError(apiErrorMessage(failure, failure.message || "Unable to receive stock."));
      if (receiptCanBeCorrected(failure)) { sessionStorage.removeItem(storageKey); setAttempt(null); }
    } finally { busy.current = false; }
  };
  return <form onSubmit={submit} className="space-y-4">
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-100/70">Select only delivered items. Unselected items stay outstanding. Each selected line creates a batch, converts to the base unit and preserves FEFO.</div>
    {attempt && <p role="status" className="text-xs text-amber-300">Pending submission saved. Retry sends the original quantities and key; do not create another receipt until its outcome is confirmed.</p>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {receivable.map(line => {
      const row = lines[line._id]; const remaining = Number(line.quantity) - Number(line.receivedQuantity);
      const purchaseUnit = line.purchaseUnit || line.item?.purchaseUnit || line.item?.unit;
      const baseUnit = line.baseUnit || line.item?.unit; const factor = Number(line.conversionFactor || 1);
      const maximum = Number((Number(line.quantity) * (1 + (manager ? Number(policy.overReceiveTolerancePercent || 0) : 0) / 100) - Number(line.receivedQuantity)).toFixed(6));
      return <div key={line._id} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
        <label className="flex items-start gap-3 text-sm font-medium text-white"><input type="checkbox" checked={row.selected} disabled={locked} onChange={event => set(line._id, "selected", event.target.checked)} className="mt-1 accent-amber-500" /><span>{line.itemName}<span className="mt-1 block text-xs font-normal text-neutral-400">Ordered {formatQuantity(line.quantity, purchaseUnit)} · Received {formatQuantity(line.receivedQuantity, purchaseUnit)} · Remaining {formatQuantity(remaining, purchaseUnit)}</span></span></label>
        {row.selected && <fieldset disabled={locked} className="space-y-3">
          <p className="text-xs text-emerald-300">Adds {formatQuantity(Number(row.quantity || 0) * factor, baseUnit)} · 1 {purchaseUnit} = {factor} {baseUnit}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={`Receive quantity (${purchaseUnit})`} hint={`Maximum ${maximum} including authorized tolerance`}><input required min="0.000001" max={maximum} step="any" type="number" className={inputClass} value={row.quantity} onChange={event => set(line._id, "quantity", event.target.value)} /></Field>
            <Field label="Batch / Lot number" hint="Blank generates a lot automatically"><input className={inputClass} value={row.lotNumber} onChange={event => set(line._id, "lotNumber", event.target.value.toUpperCase())} /></Field>
            <Field label="Actual Brand" hint={line.requestedBrand ? `Requested: ${line.requestedBrand}` : "Optional; separate from supplier"}><input maxLength={120} className={inputClass} value={row.brand} onChange={event => set(line._id, "brand", event.target.value)} /></Field>
            <Field label="Received date"><DarkDatePicker type="datetime-local" className={inputClass} value={row.receivedAt} onChange={event => set(line._id, "receivedAt", event.target.value)} /></Field>
            <Field label="Expiry date"><DarkDatePicker className={inputClass} disabled={!line.item?.tracksExpiry} value={row.expiryDate} onChange={event => set(line._id, "expiryDate", event.target.value)} /></Field>
            <Field label="Line notes"><input className={inputClass} value={row.notes} onChange={event => set(line._id, "notes", event.target.value)} /></Field>
          </div>
          {Number(row.quantity) > remaining && <Field label="Over-receive reason (Manager/Admin required)"><textarea required className={textareaClass} value={row.overrideReason} onChange={event => set(line._id, "overrideReason", event.target.value)} /></Field>}
        </fieldset>}
      </div>;
    })}
    <Field label="Receipt notes"><textarea disabled={locked} className={textareaClass} value={notes} onChange={event => setNotes(event.target.value)} /></Field>
    <div className="flex justify-end"><Button type="submit" disabled={submitting || (!attempt && !Object.values(lines).some(row => row.selected))}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}{attempt ? "Retry original receipt" : "Receive selected items"}</Button></div>
  </form>;
}
