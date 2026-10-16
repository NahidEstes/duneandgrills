export const deliveryStatusLabel = status => ({ unassigned: "Unassigned", assigned: "Assigned", picked_up: "Picked Up", delivered: "Delivered", issue: "Delivery Issue" })[status] || "Unavailable";
export const deliveryModeQuery = ({ preview, rehearsal }) => preview ? "?preview=1" : rehearsal ? "?rehearsal=1" : "";
export const customerPhoneHref = phone => {
  if (typeof phone !== "string" || !/^[+\d][\d ()-]{6,24}$/.test(phone)) return null;
  const number = phone.replace(/[ ()-]/g, "");
  return /^\+?\d{7,15}$/.test(number) ? `tel:${number}` : null;
};
export const customerMapHref = (address, coordinates) => {
  const valid = typeof coordinates?.latitude === 'number' && typeof coordinates?.longitude === 'number' && Number.isFinite(coordinates.latitude) && Number.isFinite(coordinates.longitude) && Math.abs(coordinates.latitude) <= 90 && Math.abs(coordinates.longitude) <= 180;
  const query = valid ? `${coordinates.latitude},${coordinates.longitude}` : typeof address === 'string' ? address.trim() : '';
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
};

// Failed/uncertain submissions reuse their in-memory key. Never persist or queue offline writes.
export function createDeliverySubmission() {
  const requests = new Map();
  let pending = false;
  return async (operation, contents, send, online = true) => {
    if (!online) throw new Error("You are offline. No delivery action has been queued. Reconnect and retry.");
    if (pending) throw new Error("A delivery request is already running.");
    const signature = JSON.stringify({ operation, contents });
    if (!requests.has(signature)) requests.set(signature, crypto.randomUUID());
    pending = true;
    try {
      const result = await send({ ...contents, idempotencyKey: requests.get(signature) });
      if (!result.success) throw new Error(result.message || "Delivery action was not confirmed.");
      requests.delete(signature); return result;
    } finally { pending = false; }
  };
}
