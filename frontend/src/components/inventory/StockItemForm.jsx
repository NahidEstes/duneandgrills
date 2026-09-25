"use client";

import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";

import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, Save } from "lucide-react";
import { fetchInventorySkuSuggestion } from "@/src/api/inventoryApi.js";
import { Button, Field, inputClass, textareaClass } from "./InventoryUI.jsx";
import { INVENTORY_UNITS, PURCHASE_UNITS } from "./inventoryUtils.js";

const blank = {
  name: "", sku: "", category: "", unit: "kg", purchaseUnit: "kg", purchaseConversionFactor: 1, openingStock: 0, reorderLevel: 0,
  reorderEnabled: false, targetStock: 0, safetyStock: 0, leadTimeDays: 0, minimumOrderQuantity: 1, orderMultiple: 1, supplierItemCode: "",
  unitCost: 0, supplier: "", tracksExpiry: false, expiryDate: "", storageLocation: "",
  isActive: true, allowNegativeStock: false,
};

export default function StockItemForm({ item, categories, suppliers, onSubmit, submitting }) {
  const [form, setForm] = useState(blank);
  const [skuAutomatic, setSkuAutomatic] = useState(true);
  const [skuState, setSkuState] = useState({ loading: false, error: "" });
  useEffect(() => {
    setForm(item ? {
      name: item.name || "", sku: item.sku || "", category: item.category?._id || item.category || "",
      unit: item.unit || "kg", purchaseUnit: item.purchaseUnit || item.unit || "kg",
      purchaseConversionFactor: item.purchaseConversionFactor ?? 1,
      reorderLevel: item.reorderLevel ?? 0, reorderEnabled: Boolean(item.reorderEnabled), targetStock: item.targetStock ?? 0, safetyStock: item.safetyStock ?? 0, leadTimeDays: item.leadTimeDays ?? 0, minimumOrderQuantity: item.minimumOrderQuantity ?? 1, orderMultiple: item.orderMultiple ?? 1, supplierItemCode: item.supplierItemCode || "", unitCost: item.unitCost ?? 0,
      supplier: item.supplier?._id || item.supplier || "", tracksExpiry: Boolean(item.tracksExpiry),
      expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().slice(0, 10) : "",
      storageLocation: item.storageLocation || "", isActive: item.isActive !== false,
      allowNegativeStock: Boolean(item.allowNegativeStock),
    } : blank);
    setSkuAutomatic(!item);
    setSkuState({ loading: false, error: "" });
  }, [item]);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const regenerateSku = async (categoryId = form.category) => {
    if (!categoryId || item) return;
    setSkuState({ loading: true, error: "" });
    try {
      const suggestion = await fetchInventorySkuSuggestion(categoryId);
      setForm((current) => ({ ...current, sku: suggestion.sku }));
      setSkuAutomatic(true);
      setSkuState({ loading: false, error: "" });
    } catch (error) {
      setSkuState({ loading: false, error: error?.response?.data?.message || "SKU suggestion is temporarily unavailable." });
    }
  };
  useEffect(() => {
    if (!item && form.category) regenerateSku(form.category);
    // Category is the only dependency: changing other fields must not consume/refetch suggestions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.category, item]);
  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      ...form,
      openingStock: item ? undefined : Number(form.openingStock),
      reorderLevel: Number(form.reorderLevel),
      targetStock: Number(form.targetStock), safetyStock: Number(form.safetyStock), leadTimeDays: Number(form.leadTimeDays), minimumOrderQuantity: Number(form.minimumOrderQuantity), orderMultiple: Number(form.orderMultiple),
      unitCost: Number(form.unitCost),
      purchaseConversionFactor: Number(form.purchaseConversionFactor),
      supplier: form.supplier || null,
      expiryDate: form.tracksExpiry && form.expiryDate ? form.expiryDate : null,
      autoGenerateSku: !item && skuAutomatic,
    });
  };
  return <form onSubmit={submit} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Item name"><input required className={inputClass} value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="e.g. Chicken breast" /></Field>
      <Field label="SKU / stable inventory ID" hint={item ? "SKU is immutable after creation so historical references remain stable." : skuAutomatic ? "Reserved atomically by the server when the item is created." : "Manual SKU will be validated for format and uniqueness."} error={skuState.error}>
        <div className="flex gap-2"><input required readOnly={Boolean(item)} className={`${inputClass} ${item ? "cursor-not-allowed text-neutral-500" : ""}`} value={form.sku} onChange={(event) => { set("sku", event.target.value.toUpperCase()); setSkuAutomatic(false); }} placeholder="Select a category" />{!item && <button type="button" onClick={() => regenerateSku()} disabled={!form.category || skuState.loading} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs text-neutral-300 hover:border-dune-amber/50 hover:text-dune-amber disabled:opacity-40" aria-label="Regenerate suggested SKU"><RefreshCw className={`h-3.5 w-3.5 ${skuState.loading ? "animate-spin" : ""}`} />Regenerate</button>}</div>
      </Field>
      <Field label="Category"><DarkSelect required className={inputClass} value={form.category} onChange={(event) => set("category", event.target.value)}><option value="">Choose category</option>{categories.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</DarkSelect></Field>
      <Field label="Usage / base unit" hint="Recipes, stock balances and deductions use this unit."><DarkSelect required className={inputClass} value={form.unit} onChange={(event) => { const next = event.target.value; setForm((current) => { const followsBaseUnit = current.purchaseUnit === current.unit; return { ...current, unit: next, purchaseUnit: followsBaseUnit ? next : current.purchaseUnit, purchaseConversionFactor: followsBaseUnit ? 1 : current.purchaseConversionFactor }; }); }}>{INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</DarkSelect></Field>
      <Field label="Purchase unit" hint="The unit shown on purchase orders and receipts."><DarkSelect required className={inputClass} value={form.purchaseUnit} onChange={(event) => { const next = event.target.value; setForm((current) => ({ ...current, purchaseUnit: next, purchaseConversionFactor: next === current.unit ? 1 : current.purchaseConversionFactor })); }}>{PURCHASE_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</DarkSelect></Field>
      <Field label={`Base units per ${form.purchaseUnit || "purchase unit"}`} hint={`1 ${form.purchaseUnit || "purchase unit"} = ${Number(form.purchaseConversionFactor) || 0} ${form.unit}`}><input required min="0.000001" step="any" type="number" className={inputClass} value={form.purchaseConversionFactor} onChange={(event) => set("purchaseConversionFactor", event.target.value)} /></Field>
      {!item && <Field label={`Opening stock (${form.unit})`} hint="Opening stock is entered in the base unit and saved as a batch."><input required min="0" step="any" type="number" className={inputClass} value={form.openingStock} onChange={(event) => set("openingStock", event.target.value)} /></Field>}
      <Field label="Reorder level"><input required min="0" step="any" type="number" className={inputClass} value={form.reorderLevel} onChange={(event) => set("reorderLevel", event.target.value)} /></Field>
      <Field label={`Target / par stock (${form.unit})`}><input required min="0" step="any" type="number" className={inputClass} value={form.targetStock} onChange={(event) => set("targetStock", event.target.value)} /></Field>
      <Field label={`Safety stock (${form.unit})`}><input required min="0" step="any" type="number" className={inputClass} value={form.safetyStock} onChange={(event) => set("safetyStock", event.target.value)} /></Field>
      <Field label="Lead time (days)" hint="0 uses the supplier or global default."><input required min="0" max="3650" step="1" type="number" className={inputClass} value={form.leadTimeDays} onChange={(event) => set("leadTimeDays", event.target.value)} /></Field>
      <Field label={`Minimum order quantity (${form.purchaseUnit})`}><input required min="0.000001" step="any" type="number" className={inputClass} value={form.minimumOrderQuantity} onChange={(event) => set("minimumOrderQuantity", event.target.value)} /></Field>
      <Field label={`Order multiple (${form.purchaseUnit})`} hint="Suggested purchases round up to this multiple."><input required min="0.000001" step="any" type="number" className={inputClass} value={form.orderMultiple} onChange={(event) => set("orderMultiple", event.target.value)} /></Field>
      <Field label="Supplier item code"><input className={inputClass} value={form.supplierItemCode} onChange={(event) => set("supplierItemCode", event.target.value)} /></Field>
      <Field label={`Base unit cost (SAR / ${form.unit})`} hint="Recipe costing uses this base-unit value."><input required min="0" step="0.01" type="number" className={inputClass} value={form.unitCost} onChange={(event) => set("unitCost", event.target.value)} /></Field>
      <Field label="Primary supplier"><DarkSelect className={inputClass} value={form.supplier} onChange={(event) => set("supplier", event.target.value)}><option value="">No supplier</option>{suppliers.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</DarkSelect></Field>
      <Field label="Storage location"><input className={inputClass} value={form.storageLocation} onChange={(event) => set("storageLocation", event.target.value)} placeholder="Walk-in freezer · Shelf B2" /></Field>
      {form.tracksExpiry && <Field label="Next expiry date"><DarkDatePicker className={inputClass} value={form.expiryDate} onChange={(event) => set("expiryDate", event.target.value)} /></Field>}
    </div>
    <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:grid-cols-4">
      <label className="flex items-center gap-3 text-xs text-neutral-300"><input type="checkbox" checked={form.reorderEnabled} onChange={(event) => set("reorderEnabled", event.target.checked)} className="h-4 w-4 accent-amber-500" /> Smart reorder</label>
      <label className="flex items-center gap-3 text-xs text-neutral-300"><input type="checkbox" checked={form.tracksExpiry} onChange={(event) => set("tracksExpiry", event.target.checked)} className="h-4 w-4 accent-amber-500" /> Track expiry</label>
      <label className="flex items-center gap-3 text-xs text-neutral-300"><input type="checkbox" checked={form.isActive} onChange={(event) => set("isActive", event.target.checked)} className="h-4 w-4 accent-amber-500" /> Active item</label>
      <label className="flex items-center gap-3 text-xs text-neutral-300"><input type="checkbox" checked={form.allowNegativeStock} onChange={(event) => set("allowNegativeStock", event.target.checked)} className="h-4 w-4 accent-amber-500" /> Allow negative stock</label>
    </div>
    <div className="flex justify-end"><Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{item ? "Save changes" : "Create item"}</Button></div>
  </form>;
}
