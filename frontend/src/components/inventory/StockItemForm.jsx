"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { Button, Field, inputClass, textareaClass } from "./InventoryUI.jsx";
import { INVENTORY_UNITS } from "./inventoryUtils.js";

const blank = {
  name: "", sku: "", category: "", unit: "kg", openingStock: 0, reorderLevel: 0,
  unitCost: 0, supplier: "", tracksExpiry: false, expiryDate: "", storageLocation: "",
  isActive: true, allowNegativeStock: false,
};

export default function StockItemForm({ item, categories, suppliers, onSubmit, submitting }) {
  const [form, setForm] = useState(blank);
  useEffect(() => {
    setForm(item ? {
      name: item.name || "", sku: item.sku || "", category: item.category?._id || item.category || "",
      unit: item.unit || "kg", reorderLevel: item.reorderLevel ?? 0, unitCost: item.unitCost ?? 0,
      supplier: item.supplier?._id || item.supplier || "", tracksExpiry: Boolean(item.tracksExpiry),
      expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().slice(0, 10) : "",
      storageLocation: item.storageLocation || "", isActive: item.isActive !== false,
      allowNegativeStock: Boolean(item.allowNegativeStock),
    } : blank);
  }, [item]);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      ...form,
      openingStock: item ? undefined : Number(form.openingStock),
      reorderLevel: Number(form.reorderLevel),
      unitCost: Number(form.unitCost),
      supplier: form.supplier || null,
      expiryDate: form.tracksExpiry && form.expiryDate ? form.expiryDate : null,
    });
  };
  return <form onSubmit={submit} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Item name"><input required className={inputClass} value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="e.g. Chicken breast" /></Field>
      <Field label="SKU / stable inventory ID" hint="Used for future integrations and must remain unique."><input required className={inputClass} value={form.sku} onChange={(event) => set("sku", event.target.value.toUpperCase())} placeholder="INV-CHKN-001" /></Field>
      <Field label="Category"><select required className={inputClass} value={form.category} onChange={(event) => set("category", event.target.value)}><option value="">Choose category</option>{categories.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</select></Field>
      <Field label="Unit"><select required className={inputClass} value={form.unit} onChange={(event) => set("unit", event.target.value)}>{INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></Field>
      {!item && <Field label="Opening stock" hint="Saved as an opening-balance transaction."><input required min="0" step="any" type="number" className={inputClass} value={form.openingStock} onChange={(event) => set("openingStock", event.target.value)} /></Field>}
      <Field label="Reorder level"><input required min="0" step="any" type="number" className={inputClass} value={form.reorderLevel} onChange={(event) => set("reorderLevel", event.target.value)} /></Field>
      <Field label="Unit cost (SAR)"><input required min="0" step="0.01" type="number" className={inputClass} value={form.unitCost} onChange={(event) => set("unitCost", event.target.value)} /></Field>
      <Field label="Primary supplier"><select className={inputClass} value={form.supplier} onChange={(event) => set("supplier", event.target.value)}><option value="">No supplier</option>{suppliers.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</select></Field>
      <Field label="Storage location"><input className={inputClass} value={form.storageLocation} onChange={(event) => set("storageLocation", event.target.value)} placeholder="Walk-in freezer · Shelf B2" /></Field>
      {form.tracksExpiry && <Field label="Next expiry date"><input type="date" className={inputClass} value={form.expiryDate} onChange={(event) => set("expiryDate", event.target.value)} /></Field>}
    </div>
    <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:grid-cols-3">
      <label className="flex items-center gap-3 text-xs text-neutral-300"><input type="checkbox" checked={form.tracksExpiry} onChange={(event) => set("tracksExpiry", event.target.checked)} className="h-4 w-4 accent-amber-500" /> Track expiry</label>
      <label className="flex items-center gap-3 text-xs text-neutral-300"><input type="checkbox" checked={form.isActive} onChange={(event) => set("isActive", event.target.checked)} className="h-4 w-4 accent-amber-500" /> Active item</label>
      <label className="flex items-center gap-3 text-xs text-neutral-300"><input type="checkbox" checked={form.allowNegativeStock} onChange={(event) => set("allowNegativeStock", event.target.checked)} className="h-4 w-4 accent-amber-500" /> Allow negative stock</label>
    </div>
    <div className="flex justify-end"><Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{item ? "Save changes" : "Create item"}</Button></div>
  </form>;
}
