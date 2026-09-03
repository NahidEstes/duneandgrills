"use client";

import { useState } from "react";
import { LoaderCircle, ShieldAlert, Trash2 } from "lucide-react";
import { Button, Field, inputClass, textareaClass } from "./InventoryUI.jsx";
import { formatQuantity, formatSar, humanize } from "./inventoryUtils.js";

const reasons = ["SPOILED", "EXPIRED", "BROKEN", "DAMAGED_PACKAGE", "SPILLAGE", "OVERCOOKED", "OTHER"];
const initialState = { movementType: "WASTE", item: "", quantity: "", reasonCode: "SPOILED", notes: "", occurredAt: "" };

export default function WasteRecordForm({ items, submitting, onSubmit }) {
  const [form, setForm] = useState(initialState);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const selected = items.find((item) => item._id === form.item);
  const costImpact = Number(form.quantity || 0) * Number(selected?.unitCost || 0);
  const submit = async (event) => {
    event.preventDefault();
    const saved = await onSubmit({ ...form, quantity: Number(form.quantity), occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined });
    if (saved) setForm(initialState);
  };
  return <form onSubmit={submit} className="space-y-4">
    <div className="grid grid-cols-2 gap-2">{[["WASTE", "Waste", Trash2], ["DAMAGED", "Damaged", ShieldAlert]].map(([value, label, Icon]) => <button key={value} type="button" onClick={() => set("movementType", value)} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${form.movementType === value ? "border-dune-amber/50 bg-dune-amber/10 text-dune-amber" : "border-white/10 bg-black/20 text-neutral-500"}`}><Icon className="h-4 w-4" />{label}</button>)}</div>
    <Field label="Inventory item"><select required className={inputClass} value={form.item} onChange={(event) => set("item", event.target.value)}><option value="">Choose item</option>{items.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.sku}</option>)}</select></Field>
    {selected && <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs"><div><p className="text-neutral-600">Available stock</p><p className="mt-1 font-semibold text-white">{formatQuantity(selected.currentStock, selected.unit)}</p></div><div><p className="text-neutral-600">Estimated cost impact</p><p className="mt-1 font-semibold text-red-400">{formatSar(costImpact)}</p></div></div>}
    <div className="grid gap-4 sm:grid-cols-2"><Field label={`Quantity lost${selected ? ` (${selected.unit})` : ""}`}><input required type="number" min="0.000001" max={selected?.currentStock} step="any" className={inputClass} value={form.quantity} onChange={(event) => set("quantity", event.target.value)} /></Field><Field label="Reason"><select className={inputClass} value={form.reasonCode} onChange={(event) => set("reasonCode", event.target.value)}>{reasons.map((reason) => <option key={reason} value={reason}>{humanize(reason)}</option>)}</select></Field></div>
    <Field label="Recorded date and time" hint="Leave blank to use the current time."><input type="datetime-local" className={inputClass} value={form.occurredAt} onChange={(event) => set("occurredAt", event.target.value)} /></Field>
    <Field label="Notes"><textarea className={textareaClass} maxLength={500} value={form.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Describe what happened…" /></Field>
    <Button type="submit" className="w-full" disabled={submitting}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : form.movementType === "WASTE" ? <Trash2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}Record {form.movementType === "WASTE" ? "Waste" : "Damaged Item"}</Button>
  </form>;
}
