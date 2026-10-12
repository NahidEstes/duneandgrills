import { ORDER_STATUS_LABELS, orderPaymentLabel, deliveryStatusLabel } from "./deliveryManagementPresentation.js";

export function DeliveryBadge({ kind, value, label }) {
  const positive = kind === "restaurant" ? ["ready", "delivered"].includes(value) : kind === "payment" ? value === "paid" : value === "delivered";
  const danger = ["cancelled", "failed", "refunded", "voided", "issue"].includes(value);
  const tone = danger ? "border-red-400/30 bg-red-500/10 text-red-200" : positive ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-amber-400/30 bg-amber-500/10 text-amber-200";
  return <span className={`inline-flex max-w-full rounded-lg border px-2 py-1 text-xs font-medium ${tone}`}>{label || (kind === "restaurant" ? ORDER_STATUS_LABELS[value] || "Restaurant status unavailable" : kind === "delivery" ? deliveryStatusLabel(value) : orderPaymentLabel({ paymentStatus: value }))}</span>;
}
