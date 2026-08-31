"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, PackageCheck } from "lucide-react";
import { Button, Field, inputClass, textareaClass } from "./InventoryUI.jsx";
import { formatQuantity } from "./inventoryUtils.js";

export default function PurchaseReceiptForm({ order, onSubmit, submitting }) {
  const receivable = useMemo(() => order.items.filter((line) => line.receivedQuantity < line.quantity), [order]);
  const [lines, setLines] = useState(() => Object.fromEntries(receivable.map((line) => [line._id, { quantity: line.quantity - line.receivedQuantity, expiryDate: line.expiryDate ? new Date(line.expiryDate).toISOString().slice(0, 10) : "", notes: "" }])));
  const [notes, setNotes] = useState("");
  const set = (id, field, value) => setLines((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  const submit = (event) => { event.preventDefault(); onSubmit({ notes, items: receivable.map((line) => ({ lineId: line._id, quantity: Number(lines[line._id].quantity), expiryDate: lines[line._id].expiryDate || null, notes: lines[line._id].notes })) }); };
  return <form onSubmit={submit} className="space-y-4"><div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-100/70">Receiving updates inventory automatically and creates a purchase-receipt movement for every line.</div>{receivable.map((line) => { const remaining = line.quantity - line.receivedQuantity; return <div key={line._id} className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:grid-cols-3"><div><p className="text-sm font-medium text-white">{line.itemName}</p><p className="mt-1 text-xs text-neutral-600">Remaining {formatQuantity(remaining, line.item?.unit)}</p></div><Field label="Receive quantity"><input required min="0.0001" max={remaining} step="any" type="number" className={inputClass} value={lines[line._id].quantity} onChange={(event) => set(line._id, "quantity", event.target.value)} /></Field><Field label="Expiry date"><input type="date" className={inputClass} value={lines[line._id].expiryDate} onChange={(event) => set(line._id, "expiryDate", event.target.value)} /></Field></div>; })}<Field label="Receipt notes"><textarea className={textareaClass} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field><div className="flex justify-end"><Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}Receive stock</Button></div></form>;
}
