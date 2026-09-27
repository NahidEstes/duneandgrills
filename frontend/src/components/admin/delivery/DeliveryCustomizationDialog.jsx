"use client";

import { Check, Minus, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import SmartImage from "../../SmartImage.jsx";
import { formatAdminCurrency } from "../adminUi.js";

const SPICE_LABELS = { "no-spice": "No Spice", mild: "Mild", medium: "Medium", hot: "Hot" };

export default function DeliveryCustomizationDialog({ product, onClose, onAdd }) {
  const spice = product.customization?.spice || {};
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState([]);
  const [spiceLevel, setSpiceLevel] = useState(spice.enabled ? spice.default || spice.options?.[0] || "" : "");
  const [note, setNote] = useState("");
  const chosenAddOns = useMemo(() => (product.addOns || []).filter((row) => selected.includes(String(row._id))), [product.addOns, selected]);
  const unitPrice = Number((Number(product.price) + chosenAddOns.reduce((sum, row) => sum + Number(row.price), 0)).toFixed(2));
  const toggle = (id) => setSelected((rows) => rows.includes(String(id)) ? rows.filter((value) => value !== String(id)) : [...rows, String(id)]);
  const submit = () => onAdd({
    productId: product._id,
    productType: product.productType,
    name: product.name,
    image: product.image,
    price: unitPrice,
    quantity,
    customization: { selectedAddOns: chosenAddOns.map((row) => ({ addOn: row._id, quantity: 1 })), spiceLevel, note: note.trim() },
    customizationLabel: [...chosenAddOns.map((row) => row.name), spiceLevel ? SPICE_LABELS[spiceLevel] : "", note.trim()].filter(Boolean).join(" · "),
  });

  return <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section role="dialog" aria-modal="true" aria-labelledby="delivery-customize-title" className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#101416] p-5 shadow-2xl">
    <div className="flex items-start gap-4"><SmartImage src={product.image} alt="" width={160} height={160} className="h-20 w-20 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="text-xs uppercase tracking-widest text-dune-amber">Customize item</p><h2 id="delivery-customize-title" className="mt-1 text-xl font-semibold text-white">{product.name}</h2><p className="mt-1 text-sm text-neutral-500">{formatAdminCurrency(unitPrice)} each</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-neutral-400 hover:bg-white/5 hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button></div>
    <div className="mt-5 flex items-center justify-between"><p className="text-sm font-medium text-white">Quantity</p><div className="flex items-center rounded-lg border border-white/10"><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="p-2 text-neutral-400"><Minus className="h-4 w-4" /></button><span className="w-10 text-center text-sm text-white">{quantity}</span><button type="button" onClick={() => setQuantity((value) => Math.min(99, value + 1))} className="p-2 text-neutral-400"><Plus className="h-4 w-4" /></button></div></div>
    {product.addOns?.length > 0 && <fieldset className="mt-5"><legend className="text-sm font-medium text-white">Add-ons <span className="font-normal text-neutral-600">(optional)</span></legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{product.addOns.map((row) => { const active = selected.includes(String(row._id)); return <button key={row._id} type="button" onClick={() => toggle(row._id)} aria-pressed={active} className={`relative rounded-xl border p-3 text-left ${active ? "border-dune-amber bg-dune-amber/10" : "border-white/10 bg-black/20"}`}><span className={`absolute right-2 top-2 grid h-5 w-5 place-items-center rounded border ${active ? "border-dune-amber bg-dune-amber text-black" : "border-white/20"}`}>{active && <Check className="h-3 w-3" />}</span>{row.image && <SmartImage src={row.image} alt="" width={100} height={64} className="mb-2 h-12 w-full rounded-lg object-contain" />}<span className="block truncate text-xs font-medium text-white">{row.name}</span><span className="text-xs text-dune-amber">+ {formatAdminCurrency(row.price)}</span></button>; })}</div></fieldset>}
    {spice.enabled && spice.options?.length > 0 && <fieldset className="mt-5"><legend className="text-sm font-medium text-white">Spice level</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{spice.options.map((value) => <button key={value} type="button" onClick={() => setSpiceLevel(value)} className={`h-10 rounded-lg border text-xs ${spiceLevel === value ? "border-dune-amber bg-dune-amber/10 text-dune-amber" : "border-white/10 text-neutral-400"}`}>{SPICE_LABELS[value] || value}</button>)}</div></fieldset>}
    <label className="mt-5 block text-sm font-medium text-white">Item note <span className="font-normal text-neutral-600">(optional)</span><textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 240))} className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-dune-amber/60" /></label>
    <button type="button" onClick={submit} className="mt-5 h-12 w-full rounded-xl bg-dune-amber font-semibold text-black">Add {quantity} · {formatAdminCurrency(unitPrice * quantity)}</button>
  </section></div>;
}
