"use client";

import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";
import { useMemo, useState } from "react";
import { LoaderCircle, PackageCheck } from "lucide-react";
import { Button, Field, inputClass, textareaClass } from "./InventoryUI.jsx";
import { formatQuantity } from "./inventoryUtils.js";

export default function PurchaseReceiptForm({ order, onSubmit, submitting }) {
  const receivable = useMemo(
    () => order.items.filter((line) => line.receivedQuantity < line.quantity),
    [order]
  );
  const [lines, setLines] = useState(() => Object.fromEntries(receivable.map((line) => [
    line._id,
    {
      quantity: line.quantity - line.receivedQuantity,
      lotNumber: "",
      receivedAt: "",
      expiryDate: line.expiryDate ? new Date(line.expiryDate).toISOString().slice(0, 10) : "",
      notes: "",
    },
  ])));
  const [notes, setNotes] = useState("");
  const set = (id, field, value) => setLines((current) => ({
    ...current,
    [id]: { ...current[id], [field]: value },
  }));
  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      notes,
      idempotencyKey: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      items: receivable.map((line) => ({
        lineId: line._id,
        quantity: Number(lines[line._id].quantity),
        lotNumber: lines[line._id].lotNumber.trim() || null,
        receivedAt: lines[line._id].receivedAt || null,
        expiryDate: lines[line._id].expiryDate || null,
        notes: lines[line._id].notes,
      })),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-100/70">
        Each receipt creates a separate batch. Stock is converted to the base unit automatically and future deductions use FEFO.
      </div>
      {receivable.map((line) => {
        const remaining = Number(line.quantity) - Number(line.receivedQuantity);
        const purchaseUnit = line.purchaseUnit || line.item?.purchaseUnit || line.item?.unit;
        const baseUnit = line.baseUnit || line.item?.unit;
        const factor = Number(line.conversionFactor || line.item?.purchaseConversionFactor || 1);
        const baseQuantity = Number(lines[line._id].quantity || 0) * factor;
        return (
          <div key={line._id} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">{line.itemName}</p>
                <p className="mt-1 text-xs text-neutral-600">
                  Remaining {formatQuantity(remaining, purchaseUnit)} · 1 {purchaseUnit} = {factor} {baseUnit}
                </p>
              </div>
              <p className="rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-300">
                Adds {formatQuantity(baseQuantity, baseUnit)}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={`Receive quantity (${purchaseUnit})`}>
                <input required min="0.0001" max={remaining} step="any" type="number" className={inputClass} value={lines[line._id].quantity} onChange={(event) => set(line._id, "quantity", event.target.value)} />
              </Field>
              <Field label="Batch / Lot number" hint="Leave blank to generate one automatically.">
                <input className={inputClass} value={lines[line._id].lotNumber} onChange={(event) => set(line._id, "lotNumber", event.target.value.toUpperCase())} placeholder="SUP-LOT-2026-001" />
              </Field>
              <Field label="Received date" hint="Leave blank to use the current time.">
                <DarkDatePicker type="datetime-local" className={inputClass} value={lines[line._id].receivedAt} onChange={(event) => set(line._id, "receivedAt", event.target.value)} />
              </Field>
              <Field label="Expiry date">
                <DarkDatePicker className={inputClass} disabled={!line.item?.tracksExpiry} value={lines[line._id].expiryDate} onChange={(event) => set(line._id, "expiryDate", event.target.value)} />
              </Field>
            </div>
          </div>
        );
      })}
      <Field label="Receipt notes">
        <textarea className={textareaClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          Receive stock
        </Button>
      </div>
    </form>
  );
}
