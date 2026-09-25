"use client";

import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { Button, Field, Money, inputClass, textareaClass } from "./InventoryUI.jsx";
import { fetchPurchasePriceHistory } from "@/src/api/inventoryApi.js";

const emptyLine = (key = "new-0") => ({ key, item: "", quantity: 1, unitCost: 0, expiryDate: "", purchaseUnit: "", baseUnit: "", conversionFactor: 1 });

export default function PurchaseOrderForm({ order, suppliers, items, onSubmit, submitting }) {
  const [priceHints, setPriceHints] = useState({});
  const [form, setForm] = useState({
    supplier: "", tax: 0, discount: 0, additionalCharges: 0, expectedAt: "", notes: "", priceOverrideReason: "", items: [emptyLine()],
  });

  useEffect(() => {
    setForm(order ? {
      supplier: order.supplier?._id || order.supplier,
      tax: order.tax || 0,
      discount: order.discount || 0,
      additionalCharges: order.additionalCharges || 0,
      expectedAt: order.expectedAt ? new Date(order.expectedAt).toISOString().slice(0, 10) : "",
      notes: order.notes || "",
      priceOverrideReason: "",
      items: order.items.map((line) => ({
        key: line._id,
        item: line.item?._id || line.item,
        quantity: line.quantity,
        unitCost: line.unitCost,
        purchaseUnit: line.purchaseUnit || line.item?.purchaseUnit || line.item?.unit || "",
        baseUnit: line.baseUnit || line.item?.unit || "",
        conversionFactor: line.conversionFactor || line.item?.purchaseConversionFactor || 1,
        expiryDate: line.expiryDate ? new Date(line.expiryDate).toISOString().slice(0, 10) : "",
      })),
    } : { supplier: "", tax: 0, discount: 0, additionalCharges: 0, expectedAt: "", notes: "", priceOverrideReason: "", items: [emptyLine()] });
  }, [order]);

  const updateLine = (key, field, value) => setForm((current) => ({
    ...current,
    items: current.items.map((line) => line.key === key ? { ...line, [field]: value } : line),
  }));
  const chooseItem = async (key, itemId) => {
    const item = items.find((row) => row._id === itemId);
    setForm((current) => ({
      ...current,
      items: current.items.map((line) => line.key === key
        ? { ...line, item: itemId, ...(item ? {
          unitCost: Number(item.unitCost || 0) * Number(item.purchaseConversionFactor || 1),
          purchaseUnit: item.purchaseUnit || item.unit,
          baseUnit: item.unit,
          conversionFactor: item.purchaseConversionFactor || 1,
        } : {}) }
        : line),
    }));
    if (itemId) fetchPurchasePriceHistory({ item: itemId, limit: 20 }).then((result) => setPriceHints((current) => ({ ...current, [key]: result.summaries?.[0] || null }))).catch(() => undefined);
  };
  const subtotal = useMemo(
    () => form.items.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0),
    [form.items]
  );
  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      ...form,
      tax: Number(form.tax),
      discount: Number(form.discount),
      additionalCharges: Number(form.additionalCharges),
      expectedAt: form.expectedAt || null,
      items: form.items.map(({ item, quantity, unitCost, expiryDate }) => ({
        item, quantity: Number(quantity), unitCost: Number(unitCost), expiryDate: expiryDate || null,
      })),
    });
  };

  return <form onSubmit={submit} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Supplier"><DarkSelect required className={inputClass} value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })}><option value="">Choose supplier</option>{suppliers.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</DarkSelect></Field>
      <Field label="Expected date"><DarkDatePicker className={inputClass} value={form.expectedAt} onChange={(event) => setForm({ ...form, expectedAt: event.target.value })} /></Field>
      <Field label="Tax (SAR)"><input min="0" step="0.01" type="number" className={inputClass} value={form.tax} onChange={(event) => setForm({ ...form, tax: event.target.value })} /></Field>
      <Field label="Discount (SAR)"><input min="0" step="0.01" type="number" className={inputClass} value={form.discount} onChange={(event) => setForm({ ...form, discount: event.target.value })} /></Field>
      <Field label="Additional charges"><input min="0" step="0.01" type="number" className={inputClass} value={form.additionalCharges} onChange={(event) => setForm({ ...form, additionalCharges: event.target.value })} /></Field>
    </div>
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Purchase items</h3>
        <Button variant="secondary" size="sm" onClick={() => setForm((current) => ({
          ...current,
          items: [...current.items, emptyLine(`new-${Date.now()}-${current.items.length}`)],
        }))}><Plus className="h-3.5 w-3.5" />Add line</Button>
      </div>
      <div className="space-y-3">
        {form.items.map((line, index) => <div key={line.key} className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-3 md:grid-cols-[minmax(210px,1.4fr)_0.65fr_0.75fr_0.8fr_auto]">
          <Field label={`Item ${index + 1}`} hint={line.item ? `1 ${line.purchaseUnit} = ${line.conversionFactor} ${line.baseUnit}` : "Choose an item to load its purchase conversion."}><DarkSelect required className={inputClass} value={line.item} onChange={(event) => chooseItem(line.key, event.target.value)}><option value="">Choose item</option>{items.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.sku}</option>)}</DarkSelect></Field>
          <Field label={`Quantity${line.purchaseUnit ? ` (${line.purchaseUnit})` : ""}`} hint={line.item ? `Adds ${(Number(line.quantity || 0) * Number(line.conversionFactor || 1)).toLocaleString()} ${line.baseUnit}` : undefined}><input required min="0.0001" step="any" type="number" className={inputClass} value={line.quantity} onChange={(event) => updateLine(line.key, "quantity", event.target.value)} /></Field>
          <Field label={`Cost / ${line.purchaseUnit || "unit"} (SAR)`} hint={priceHints[line.key] ? `Last ${priceHints[line.key].source === "posted_invoice_actual" ? "actual" : "fallback"}: ${Number(priceHints[line.key].lastPrice).toFixed(2)} SAR / base unit` : line.item ? `${(Number(line.unitCost || 0) / Number(line.conversionFactor || 1)).toFixed(4)} SAR / ${line.baseUnit}` : undefined}><input required min="0" step="0.01" type="number" className={inputClass} value={line.unitCost} onChange={(event) => updateLine(line.key, "unitCost", event.target.value)} /></Field>
          <Field label="Expiry"><DarkDatePicker className={inputClass} value={line.expiryDate} onChange={(event) => updateLine(line.key, "expiryDate", event.target.value)} /></Field>
          <button type="button" disabled={form.items.length === 1} onClick={() => setForm((current) => ({ ...current, items: current.items.filter((item) => item.key !== line.key) }))} className="mt-6 grid h-10 w-10 place-items-center rounded-xl text-neutral-600 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
        </div>)}
      </div>
    </div>
    <Field label="Notes"><textarea className={textareaClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
    <Field label="Price policy override reason" hint="Required only when Settings blocks an unusual price increase."><textarea className={textareaClass} value={form.priceOverrideReason} onChange={(event) => setForm({ ...form, priceOverrideReason: event.target.value })} /></Field>
    <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-6 text-xs"><div><p className="text-neutral-600">Subtotal</p><p className="mt-1 font-semibold text-white"><Money value={subtotal} /></p></div><div><p className="text-neutral-600">Total</p><p className="mt-1 font-semibold text-dune-amberLight"><Money value={subtotal + Number(form.tax || 0) + Number(form.additionalCharges || 0) - Number(form.discount || 0)} /></p></div></div>
      <Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{order ? "Save purchase order" : "Create purchase order"}</Button>
    </div>
  </form>;
}
