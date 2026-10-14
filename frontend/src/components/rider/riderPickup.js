import { formatPrice } from "../../utils/currency.js";

// UI eligibility supplements, never replaces, the backend's own-rider, Ready,
// transaction, revision and idempotency checks.
export function riderPickupState(data, context = {}) {
  const blocked = reason => ({ allowed: false, reason });
  if (!data || context.loading) return blocked("Wait for delivery details to load.");
  if (context.preview) return blocked("Read-only preview. Pickup confirmation is disabled.");
  if (context.pending) return blocked("Waiting for server confirmation. Do not submit again.");
  if (context.offline) return blocked("You are offline. Reconnect and refresh details before confirming pickup.");
  if (context.refreshing) return blocked("Updating delivery details. Please wait for the latest status.");
  if (context.error) return blocked("Details may be outdated. Refresh details successfully before confirming pickup.");
  if (context.reviewRequired) return blocked("Delivery changed. Close this confirmation, refresh and review the current order.");
  if (context.role !== "rider" || !context.userId || String(data.riderId) !== String(context.userId)) return blocked("Only the rider assigned to this delivery can confirm pickup.");
  if (!(data.mode === "operational" || (context.rehearsal && data.mode === "rehearsal"))) return blocked("The delivery workflow is not enabled in this mode.");
  if (!data.canOperate) return blocked(data.eligibilityWarning || "This delivery requires restaurant review before pickup.");
  if (data.deliveryStatus === "issue") return blocked("A delivery issue is awaiting manager review. Pickup is paused.");
  if (data.deliveryStatus === "picked_up") return blocked("Pickup is already confirmed. Continue with the delivery.");
  if (data.deliveryStatus === "delivered") return blocked("This delivery is completed. Pickup cannot be confirmed again.");
  if (data.deliveryStatus !== "assigned") return blocked("This delivery is not at the assigned pickup stage.");
  if (data.restaurantStatus !== "ready") return blocked(({
    pending: "The kitchen has not accepted this order yet. Pickup becomes available when it is Ready.",
    confirmed: "The kitchen has accepted this order, but the food is not Ready yet.",
    preparing: "The kitchen is preparing this order. Wait until it is marked Ready before pickup.",
    "out-for-delivery": "This order is already dispatched. Refresh details to review its current delivery status.",
    delivered: "This order is already completed. Pickup cannot be confirmed again.",
  })[data.restaurantStatus] || "The order is not Ready for pickup. Refresh details or contact the restaurant.");
  if (![data.revision, data.orderRevision].every(value => Number.isSafeInteger(value) && value >= 0)) return blocked("Refresh details to verify the current order before pickup.");
  return { allowed: true, reason: "Confirm only after collecting the food." };
}

export function riderFoodStatus(data) {
  if (data.deliveryStatus === "issue") return { title: "Delivery issue — actions paused", message: "Contact the restaurant and wait for manager review.", tone: "issue", icon: "issue" };
  if (data.deliveryStatus === "delivered") return { title: "Delivery completed", message: "Pickup is finished. Cash collection is confirmed separately.", tone: "ready", icon: "completed" };
  if (data.restaurantStatus === "delivered") return { title: "Order completed · Delivery requires review", message: "The recorded delivery stage does not match the order. Refresh or contact the restaurant.", tone: "issue", icon: "issue" };
  if (data.deliveryStatus === "picked_up" || data.restaurantStatus === "out-for-delivery") return { title: "Order is on the way", message: "Pickup is already recorded or the order has been dispatched. Review the current delivery stage.", tone: "transit", icon: "transit" };
  if (data.restaurantStatus === "ready") return { title: "Food ready for pickup", message: "The restaurant has prepared this order.", tone: "ready", icon: "ready" };
  return { title: ({ pending: "Waiting for kitchen acceptance", confirmed: "Order accepted by kitchen", preparing: "Food is being prepared" })[data.restaurantStatus] || "Pickup status unavailable",
    message: "Pickup is available only after the kitchen marks this order Ready.", tone: "preparing", icon: "preparing" };
}

export const riderAmount = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? formatPrice(value) : "Amount unavailable";
