import { formatPrice } from "@/src/utils/currency.js";

export default function ManagementDeliveryDetails({ selected }) {
  return <div className="space-y-4">
    <details><summary className="min-h-11 cursor-pointer py-3 text-sm text-dune-amber">View delivery details</summary>
      {!selected.items ? <p className="text-sm text-neutral-400">Authorized details not yet verified.</p> : <div className="space-y-4 text-sm">
        <p className="break-words text-neutral-300">Pickup: {selected.pickupInstructions || "Not recorded"}</p>
        {selected.customer ? <div className="space-y-2 break-words text-neutral-300"><h3 className="font-body font-semibold text-white">Customer</h3><p>{selected.customer.name}</p><p>{selected.customer.phone}</p><p>{selected.customer.address}</p>{selected.deliveryNote && <p>{selected.deliveryNote}</p>}</div> : <p className="text-xs text-neutral-400">Completed delivery: customer contact/address and delivery notes are hidden.</p>}
        {selected.issue && <p className="break-words text-amber-200">Open issue: {selected.issue.reason || "Reason unavailable"}</p>}
        <section className="rounded-xl border border-white/10 p-4"><h3 className="font-body text-lg font-semibold">Order Summary</h3>{selected.items.map((item, index) => <div key={index} className="mt-3 border-t border-white/10 pt-3"><div className="flex justify-between gap-3"><p className="min-w-0 break-words">{item.quantity} × {item.name}</p><p className="shrink-0">{formatPrice(item.lineTotal)}</p></div>{item.selectedAddOns?.map((addon, i) => <p key={i} className="text-xs text-neutral-400">{addon.quantity} × {addon.name}</p>)}{item.spiceLevel && <p className="text-xs text-neutral-400">Spice: {item.spiceLevel}</p>}{item.itemNote && <p className="break-words text-xs text-neutral-400">{item.itemNote}</p>}</div>)}<p className="mt-4 font-semibold">Order total: {formatPrice(selected.orderTotal)}</p></section>
      </div>}
    </details>
  </div>;
}
