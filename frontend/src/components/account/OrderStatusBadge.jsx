const STATUS_STYLES = {
  pending: "border-amber-500/45 bg-amber-500/10 text-amber-300",
  confirmed: "border-sky-500/45 bg-sky-500/10 text-sky-300",
  preparing: "border-orange-500/45 bg-orange-500/10 text-orange-300",
  ready: "border-cyan-500/45 bg-cyan-500/10 text-cyan-300",
  "out-for-delivery":
    "border-violet-500/45 bg-violet-500/10 text-violet-300",
  delivered: "border-emerald-500/45 bg-emerald-500/10 text-emerald-300",
  cancelled: "border-red-500/45 bg-red-500/10 text-red-300",
  refunded: "border-rose-500/45 bg-rose-500/10 text-rose-300",
  failed: "border-red-500/45 bg-red-500/10 text-red-300",
};

const STATUS_GLOWS = {
  pending: "rgba(245, 158, 11, 0.5)",
  confirmed: "rgba(56, 189, 248, 0.5)",
  preparing: "rgba(249, 115, 22, 0.5)",
  ready: "rgba(34, 211, 238, 0.5)",
  "out-for-delivery": "rgba(167, 139, 250, 0.5)",
  delivered: "rgba(52, 211, 153, 0.5)",
  cancelled: "rgba(248, 113, 113, 0.5)",
  refunded: "rgba(251, 113, 133, 0.5)",
  failed: "rgba(248, 113, 113, 0.5)",
};

const STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Order Accepted",
  preparing: "Preparing",
  ready: "Ready",
  "out-for-delivery": "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  failed: "Failed",
};

const fallbackLabel = (status = "") =>
  status
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const OrderStatusBadge = ({ status, className = "" }) => (
  <span
    className={`order-status-glow inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${
      STATUS_STYLES[status] || "border-neutral-600 text-neutral-300"
    } ${className}`}
    style={{
      "--order-status-glow":
        STATUS_GLOWS[status] || "rgba(163, 163, 163, 0.35)",
    }}
  >
    {STATUS_LABELS[status] || fallbackLabel(status)}
  </span>
);

export default OrderStatusBadge;
