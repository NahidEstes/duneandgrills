"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, LoaderCircle, RefreshCw, Scale, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createStockMovement, fetchInventoryItems, fetchStockMovements } from "@/src/api/inventoryApi.js";
import { Badge, Button, DataTable, EmptyState, Field, LoadingState, PageHeader, cardClass, inputClass, textareaClass } from "./InventoryUI.jsx";
import { apiErrorMessage, formatDate, formatQuantity, humanize } from "./inventoryUtils.js";
import useInventoryResource from "./useInventoryResource.js";

const optionsByPage = {
  "stock-in": [
    { value: "STOCK_IN", label: "Stock In", icon: ArrowDownToLine, help: "Deliveries and stock received outside a purchase order." },
    { value: "ADJUSTMENT", label: "Adjust Stock", icon: Scale, help: "Set stock to a verified exact quantity." },
  ],
  "stock-out": [
    { value: "STOCK_OUT", label: "Stock Out", icon: ArrowUpFromLine, help: "Normal usage, transfers or manual deductions." },
    { value: "WASTE", label: "Waste", icon: Trash2, help: "Record spoiled or wasted stock." },
    { value: "DAMAGED", label: "Damaged", icon: ShieldAlert, help: "Record unusable damaged stock." },
    { value: "ADJUSTMENT", label: "Adjust Stock", icon: Scale, help: "Set stock to a verified exact quantity." },
  ],
};

export default function StockMovementPage({ pageType }) {
  const options = optionsByPage[pageType];
  const [movementType, setMovementType] = useState(options[0].value);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ item: "", quantity: "", reason: "", notes: "", unitCost: "", expiryDate: "", allowNegativeStock: false });
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { fetchInventoryItems({ limit: 100, sortBy: "name", sortOrder: "asc" }).then((response) => setItems(response.data)).catch(() => toast.error("Unable to load stock items.")); }, []);
  const { data, loading, reload } = useInventoryResource(() => fetchStockMovements({ limit: 20, movementType: movementType === "ADJUSTMENT" ? "ADJUSTMENT" : undefined }), [movementType]);
  const selectedItem = items.find((item) => item._id === form.item);
  const selectedOption = options.find((option) => option.value === movementType);
  const SelectedIcon = selectedOption.icon;
  const isInbound = movementType === "STOCK_IN";
  const isAdjustment = movementType === "ADJUSTMENT";
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true);
    try {
      await createStockMovement({ ...form, movementType, quantity: Number(form.quantity), unitCost: isInbound && form.unitCost !== "" ? Number(form.unitCost) : undefined, expiryDate: isInbound && form.expiryDate ? form.expiryDate : undefined });
      toast.success(`${selectedOption.label} recorded. Stock and transaction history were updated together.`);
      setForm({ item: "", quantity: "", reason: "", notes: "", unitCost: "", expiryDate: "", allowNegativeStock: false });
      const response = await fetchInventoryItems({ limit: 100, sortBy: "name", sortOrder: "asc" }); setItems(response.data); reload({ silent: true });
    } catch (error) { toast.error(apiErrorMessage(error, "Unable to record stock movement.")); }
    finally { setSubmitting(false); }
  };
  const columns = useMemo(() => [
    { key: "date", label: "Date", render: (row) => formatDate(row.occurredAt, true) },
    { key: "item", label: "Item", render: (row) => <div><p className="font-medium text-white">{row.item?.name || "Archived item"}</p><p className="text-[0.65rem] text-neutral-600">{row.item?.sku}</p></div> },
    { key: "type", label: "Movement", render: (row) => <Badge tone={row.stockAfter >= row.stockBefore ? "success" : "danger"}>{humanize(row.movementType)}</Badge> },
    { key: "quantity", label: "Quantity", render: (row) => formatQuantity(row.quantity, row.item?.unit) },
    { key: "change", label: "Stock change", render: (row) => <span className={row.stockAfter >= row.stockBefore ? "text-emerald-400" : "text-red-400"}>{formatQuantity(row.stockBefore, row.item?.unit)} → {formatQuantity(row.stockAfter, row.item?.unit)}</span> },
    { key: "reason", label: "Reason" },
    { key: "user", label: "Recorded by", render: (row) => row.user?.name || "—" },
  ], []);

  return <div className="mx-auto max-w-[1500px]"><PageHeader title={pageType === "stock-in" ? "Stock In" : "Stock Out"} description="Every quantity change creates a permanent transaction with before and after balances." />
    <div className="mb-4 flex flex-wrap gap-2">{options.map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => setMovementType(value)} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${movementType === value ? "border-dune-amber/40 bg-dune-amber/10 text-dune-amberLight" : "border-white/10 bg-white/[0.025] text-neutral-500 hover:text-white"}`}><Icon className="h-4 w-4" />{label}</button>)}</div>
    <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <form onSubmit={submit} className={`${cardClass} h-fit p-5`}><div className="mb-5 flex items-start gap-3"><span className="rounded-xl bg-dune-amber/10 p-2.5 text-dune-amber"><SelectedIcon className="h-5 w-5" /></span><div><h2 className="font-body text-base font-semibold text-white">Record {selectedOption.label}</h2><p className="mt-1 text-xs leading-5 text-neutral-600">{selectedOption.help}</p></div></div><div className="space-y-4"><Field label="Inventory item"><select required className={inputClass} value={form.item} onChange={(event) => set("item", event.target.value)}><option value="">Choose item</option>{items.map((item) => <option key={item._id} value={item._id}>{item.name} · {formatQuantity(item.currentStock, item.unit)}</option>)}</select></Field>{selectedItem && <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs"><span className="text-neutral-600">Current stock</span><p className="mt-1 text-lg font-semibold text-white">{formatQuantity(selectedItem.currentStock, selectedItem.unit)}</p></div>}<Field label={isAdjustment ? "Verified stock quantity" : "Movement quantity"} hint={isAdjustment ? "This is the new exact stock level, not the difference." : selectedItem ? `Measured in ${selectedItem.unit}` : "Choose an item first"}><input required min="0" step="any" type="number" className={inputClass} value={form.quantity} onChange={(event) => set("quantity", event.target.value)} /></Field>{isInbound && <div className="grid gap-4 sm:grid-cols-2"><Field label="Updated unit cost (SAR)"><input min="0" step="0.01" type="number" className={inputClass} value={form.unitCost} onChange={(event) => set("unitCost", event.target.value)} placeholder={selectedItem?.unitCost ?? "0.00"} /></Field><Field label="Expiry date"><input type="date" className={inputClass} disabled={!selectedItem?.tracksExpiry} value={form.expiryDate} onChange={(event) => set("expiryDate", event.target.value)} /></Field></div>}<Field label="Reason"><input required className={inputClass} value={form.reason} onChange={(event) => set("reason", event.target.value)} placeholder="Delivery, kitchen use, spoilage…" /></Field><Field label="Notes"><textarea className={textareaClass} value={form.notes} onChange={(event) => set("notes", event.target.value)} /></Field>{!isInbound && <label className="flex items-start gap-3 rounded-xl border border-red-500/15 bg-red-500/5 p-3 text-xs text-neutral-400"><input type="checkbox" checked={form.allowNegativeStock} onChange={(event) => set("allowNegativeStock", event.target.checked)} className="mt-0.5 h-4 w-4 accent-red-500" /><span><strong className="block text-red-300">Explicitly allow negative stock</strong>Use only when an authorized backdated correction must go below zero.</span></label>}<Button type="submit" className="w-full" disabled={submitting}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Record movement</Button></div></form>
      <section className={cardClass}><div className="flex items-center justify-between border-b border-white/10 p-4"><div><h2 className="font-body text-base font-semibold text-white">Recent Stock Activity</h2><p className="text-xs text-neutral-600">Permanent audit history</p></div><Button variant="ghost" size="icon" onClick={() => reload()}><RefreshCw className="h-4 w-4" /></Button></div>{loading ? <LoadingState /> : <DataTable columns={columns} rows={data?.data} empty={<EmptyState title="No stock movements yet" />} />}</section>
    </div>
  </div>;
}
