import { formatPrice } from "@/src/utils/currency.js";
import styles from "./deliveryManagement.module.css";

const amount = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? formatPrice(value) : "Amount unavailable";
export default function ManagementDeliveryDetails({ selected }) {
  const historical = selected.deliveryStatus === "delivered";
  return <>
    <details className={styles.disclosure}><summary>Customer details</summary><div>{!selected.items ? <p>Authorized details not yet verified.</p> : <>
      {historical || !selected.customer ? <p>Completed delivery: customer contact/address and delivery notes are hidden.</p> : <div className="space-y-2"><p>{selected.customer.name || "Name unavailable"}</p><p>{selected.customer.phone || "Phone not recorded"}</p><p>{selected.customer.address || "Address not recorded"}</p>{selected.deliveryNote && <p>Delivery instructions: {selected.deliveryNote}</p>}</div>}
      <p className="mt-4">Restaurant pickup: {selected.pickupInstructions || "Not recorded"}</p>
    </>}</div></details>
    <details className={styles.disclosure}><summary>Order Summary</summary><div>{!selected.items ? <p>Authorized item details not yet verified.</p> : <>{selected.items.map((item, index) => <div key={index} className="mb-4 border-b border-white/10 pb-4"><div className="flex justify-between gap-3"><p className="min-w-0 break-words">{item.quantity} × {item.name}</p><p className="shrink-0">{amount(item.lineTotal)}</p></div>{item.selectedAddOns?.map((addon, i) => <p key={i} className="mt-1 text-xs text-neutral-400">{addon.quantity} × {addon.name}</p>)}{item.spiceLevel && <p className="mt-1 text-xs text-neutral-400">Spice: {item.spiceLevel}</p>}{!historical && item.itemNote && <p className="mt-1 break-words text-xs text-neutral-400">{item.itemNote}</p>}</div>)}<p className="font-semibold">Order total: {amount(selected.orderTotal)}</p></>}</div></details>
  </>;
}
