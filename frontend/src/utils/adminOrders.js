import { formatAdminDate, formatRelativeTime } from "../components/admin/adminUi.js";

export const ORDER_STATUS_LABELS = Object.freeze({
  pending: "Pending", confirmed: "Order Accepted", preparing: "Preparing", ready: "Ready",
  "out-for-delivery": "Out for Delivery", delivered: "Delivered", cancelled: "Cancelled",
  refunded: "Refunded", failed: "Failed",
});
export const normalizeOrderStatus = value => value === "all" || Object.hasOwn(ORDER_STATUS_LABELS, value) ? value : "all";

export function adminOrdersHref(current, changes) {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    if (value == null || value === "" || value === "all") params.delete(key);
    else params.set(key, value);
  }
  return `/admin${params.size ? `?${params}` : ""}`;
}

const SOURCES = { website: "Website", pos: "POS", phone: "Phone", jahez: "Jahez", keeta: "Keeta", hungerstation: "HungerStation", ninja: "Ninja" };
export const orderSourceLabel = value => SOURCES[value] || (value ? String(value) : "Unavailable");
const PAYMENTS = { unpaid: "Unpaid", pending: "Payment pending", paid: "Paid", partially_refunded: "Partially refunded", refunded: "Payment refunded", voided: "Payment voided", failed: "Payment failed" };
export function orderPaymentLabel(order) {
  const status = PAYMENTS[order.paymentStatus] || "Payment status unavailable";
  return order.deliveryPaymentType === "aggregator_prepaid" ? `Aggregator prepaid · ${status}` : status;
}

export const validOrderDate = value => value != null && Number.isFinite(new Date(value).getTime());
export const orderDateLabel = value => validOrderDate(value)
  ? `${formatAdminDate(value, { hour: "2-digit", minute: "2-digit", hour12: true })} · Asia/Riyadh` : "Unavailable";
export const orderAgeLabel = value => validOrderDate(value) ? formatRelativeTime(value) : "Age unavailable";
export const customerDisplayName = order => order.customer?.name?.trim() || (order.source === "pos" ? "Walk-in" : "Guest");
export const orderItemQuantity = order => Array.isArray(order.items) && order.items.every(item => typeof item.quantity === "number" && Number.isFinite(item.quantity))
  ? order.items.reduce((sum, item) => sum + item.quantity, 0) : null;

// The server supplies preparationActive using the existing operational statuses.
// Reading the clock never invents a deadline or changes the order's state.
export function orderPreparationLabel(order, now = Date.now()) {
  if (order.manualEntry) return { text: "Historical delivery entry", overdue: false };
  if (!validOrderDate(order.preparationDueAt)) return null;
  if (!order.preparationActive) return { text: `Recorded prep due: ${orderDateLabel(order.preparationDueAt)}`, overdue: false };
  const delta = new Date(order.preparationDueAt).getTime() - now;
  const minutes = Math.ceil(Math.abs(delta) / 60000);
  return { text: delta < 0 ? `Prep overdue by ${minutes} min` : delta === 0 ? "Prep due now" : `Prep due in ${minutes} min`, overdue: delta < 0 };
}
