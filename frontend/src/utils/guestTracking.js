const prefix = "dg-tracking:";
export function rememberTracking(storage, order) {
  if (!order?.orderNumber || !order.trackingToken) return;
  storage.setItem(prefix + order.orderNumber, order.trackingToken);
}
export const savedTrackingToken = (storage, number) => storage.getItem(prefix + number) || "";
export const trackingHref = number => `/menu?track=${encodeURIComponent(number)}`;
