"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import { fetchBillableQuantities } from "@/src/api/inventoryApi.js";
import { Button, Field, Money, inputClass, textareaClass } from "./InventoryUI.jsx";
import { apiErrorMessage, humanize } from "./inventoryUtils.js";

const reference = value => String(value?._id || value || "");
const availabilityKey = row => `${reference(row.purchaseOrder)}:${reference(row.purchaseOrderLine)}`;

export default function SupplierInvoiceForm({ invoice, suppliers, orders, onSubmit, submitting }) {
  const [form, setForm] = useState(() => invoice ? {
    supplier: reference(invoice.supplier), supplierInvoiceNumber: invoice.supplierInvoiceNumber,
    purchaseOrder: reference(invoice.purchaseOrders?.[0]), invoiceDate: new Date(invoice.invoiceDate).toISOString().slice(0, 10),
    dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : "",
    tax: Math.max(0, Number(invoice.tax || 0) - invoice.items.reduce((sum, row) => sum + Number(row.tax || 0), 0)),
    discount: Math.max(0, Number(invoice.discount || 0) - invoice.items.reduce((sum, row) => sum + Number(row.discount || 0), 0)),
    additionalCharges: invoice.additionalCharges || 0, note: invoice.note || "",
    items: invoice.items.map(row => ({ item: reference(row.item), purchaseOrder: reference(row.purchaseOrder), purchaseOrderLine: reference(row.purchaseOrderLine), brand: row.brand || "", quantity: row.quantity, unitPrice: row.unitPrice, tax: row.tax || 0, discount: row.discount || 0, name: row.item?.name || "Inventory item", unit: row.unit })),
  } : { supplier: "", supplierInvoiceNumber: "", purchaseOrder: "", invoiceDate: new Date().toISOString().slice(0, 10), dueDate: "", tax: 0, discount: 0, additionalCharges: 0, note: "", items: [] });
  const [availability, setAvailability] = useState({});
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => {
    if (!invoice) return;
    let active = true; setLoading(true);
    const ids = [...new Set(invoice.items.map(row => reference(row.purchaseOrder)))];
    Promise.all(ids.map(id => fetchBillableQuantities(id, invoice._id))).then(results => {
      if (active) setAvailability(Object.fromEntries(results.flat().map(row => [availabilityKey(row), row])));
    }).catch(failure => { if (active) setError(apiErrorMessage(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [invoice]);
  const availableOrders = orders.filter(row => !form.supplier || reference(row.supplier) === form.supplier);
  const chooseOrder = async id => {
    const order = orders.find(row => reference(row) === id);
    const version = ++request.current; setLoading(true); setError("");
    try {
      if (!order) { setForm(current => ({ ...current, purchaseOrder: "" })); return; }
      const rows = await fetchBillableQuantities(id, invoice?._id);
      if (version !== request.current) return;
      const byLine = new Map(rows.map(row => [reference(row.purchaseOrderLine), row]));
      setAvailability(current => ({ ...current, ...Object.fromEntries(rows.map(row => [availabilityKey(row), row])) }));
      setForm(current => {
        const existing = new Set(current.items.map(availabilityKey));
        const added = order.items.filter(line => !existing.has(`${id}:${line._id}`) && byLine.get(reference(line))?.remainingBillableQuantity > 0).map(line => ({
          item: reference(line.item), purchaseOrder: id, purchaseOrderLine: reference(line), brand: line.requestedBrand || "",
          quantity: byLine.get(reference(line)).remainingBillableQuantity, unitPrice: Number(line.unitCost), tax: 0, discount: 0, name: line.itemName, unit: line.purchaseUnit || line.baseUnit,
        }));
        return { ...current, purchaseOrder: id, supplier: reference(order.supplier), items: [...current.items, ...added] };
      });
      if (!rows.some(row => row.remainingBillableQuantity > 0)) setError("No unbilled received quantity remains on this PO. Resolve existing invoices before adding another bill.");
    } catch (failure) { if (version === request.current) setError(apiErrorMessage(failure)); }
    finally { if (version === request.current) setLoading(false); }
  };
  const line = (index, field, value) => setForm(current => ({ ...current, items: current.items.map((row, position) => position === index ? { ...row, [field]: value } : row) }));
  const submit = event => {
    event.preventDefault();
    onSubmit({ ...form, dueDate: form.dueDate || null, tax: Number(form.tax), discount: Number(form.discount), additionalCharges: Number(form.additionalCharges), items: form.items.map(({ name: _name, unit: _unit, ...row }) => ({ ...row, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), tax: Number(row.tax || 0), discount: Number(row.discount || 0) })) });
  };
  const total = form.items.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.unitPrice || 0) + Number(row.tax || 0) - Number(row.discount || 0), 0) + Number(form.tax) + Number(form.additionalCharges) - Number(form.discount);
  return <form onSubmit={submit} className="space-y-5">
    <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100/70">Drafts do not reserve goods. Submitted, review-required, approved, posted and disputed invoices do. Voiding releases the reservation. Quantities below are a preview; the server rechecks every commitment.</p>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {loading && <p role="status" className="text-xs text-amber-300">Checking remaining billable quantities…</p>}
    <fieldset disabled={submitting || loading} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Supplier"><DarkSelect required className={inputClass} value={form.supplier} onChange={event => { request.current += 1; setAvailability({}); setForm({ ...form, supplier: event.target.value, purchaseOrder: "", items: [] }); }}><option value="">Choose supplier</option>{suppliers.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</DarkSelect></Field>
        <Field label="Supplier invoice number"><input required className={inputClass} value={form.supplierInvoiceNumber} onChange={event => setForm({ ...form, supplierInvoiceNumber: event.target.value })} /></Field>
        <Field label="Purchase order"><DarkSelect required className={inputClass} value={form.purchaseOrder} onChange={event => chooseOrder(event.target.value)}><option value="">Choose received PO</option>{availableOrders.map(row => <option key={row._id} value={row._id}>{row.orderNumber} · {humanize(row.status)}</option>)}</DarkSelect><button type="button" onClick={() => chooseOrder(form.purchaseOrder)} disabled={!form.purchaseOrder} className="mt-1 text-xs text-dune-amber">Refresh / add unbilled lines</button></Field>
        <Field label="Invoice date"><DarkDatePicker required className={inputClass} value={form.invoiceDate} onChange={event => setForm({ ...form, invoiceDate: event.target.value })} /></Field>
        <Field label="Due date"><DarkDatePicker className={inputClass} value={form.dueDate} onChange={event => setForm({ ...form, dueDate: event.target.value })} /></Field>
      </div>
      <div className="space-y-3">{form.items.map((row, index) => {
        const available = availability[availabilityKey(row)];
        return <div key={availabilityKey(row)} className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-white">{row.name} · {row.unit}</p><p className="mt-1 text-xs text-neutral-400">{available ? `Received ${available.receivedQuantity} · Other invoices ${available.committedQuantity} · Remaining billable ${available.remainingBillableQuantity} · Policy maximum ${available.maximumBillableQuantity}` : "Availability not loaded; server validation still applies."}</p></div><button type="button" onClick={() => setForm(current => ({ ...current, items: current.items.filter((_, position) => position !== index) }))} aria-label={`Remove ${row.name} from invoice`} className="p-2 text-red-400"><Trash2 className="h-4 w-4" /></button></div>
          <div className="grid gap-3 sm:grid-cols-4"><Field label="Brand snapshot" hint="Separate from supplier"><input maxLength={120} className={inputClass} value={row.brand} onChange={event => line(index, "brand", event.target.value)} /></Field><Field label="Invoice qty"><input required min="0.000001" step="any" type="number" className={inputClass} value={row.quantity} onChange={event => line(index, "quantity", event.target.value)} /></Field><Field label="Unit price (SAR)"><input required min="0" step="0.01" type="number" className={inputClass} value={row.unitPrice} onChange={event => line(index, "unitPrice", event.target.value)} /></Field><Field label="Line total"><div className={`${inputClass} flex items-center`}><Money value={Number(row.quantity || 0) * Number(row.unitPrice || 0) + Number(row.tax || 0) - Number(row.discount || 0)} /></div></Field></div>
          {available && Number(row.quantity) > available.remainingBillableQuantity && <p className="text-xs text-amber-300">Exceeds remaining billable quantity. Within-policy exceptions require Manager/Admin authorization and a reason; amounts beyond the cumulative cap cannot be committed.</p>}
        </div>;
      })}</div>
      <div className="grid gap-3 sm:grid-cols-3"><Field label="Tax (SAR)"><input min="0" step="0.01" type="number" className={inputClass} value={form.tax} onChange={event => setForm({ ...form, tax: event.target.value })} /></Field><Field label="Discount (SAR)"><input min="0" step="0.01" type="number" className={inputClass} value={form.discount} onChange={event => setForm({ ...form, discount: event.target.value })} /></Field><Field label="Shipping / charges"><input min="0" step="0.01" type="number" className={inputClass} value={form.additionalCharges} onChange={event => setForm({ ...form, additionalCharges: event.target.value })} /></Field></div>
      <Field label="Notes"><textarea className={textareaClass} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} /></Field>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-neutral-400">Estimated total: <strong className="text-dune-amber"><Money value={total} /></strong></p><Button type="submit" disabled={!form.items.length}>{submitting ? "Saving…" : invoice ? "Save invoice draft" : "Create invoice"}</Button></div>
    </fieldset>
  </form>;
}
