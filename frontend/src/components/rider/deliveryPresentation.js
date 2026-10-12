export const deliveryStatusLabel = status => ({ unassigned: "Unassigned", assigned: "Assigned", picked_up: "Picked Up", delivered: "Delivered", issue: "Delivery Issue" })[status] || "Unavailable";
export const deliveryModeQuery = ({ preview, rehearsal }) => preview ? "?preview=1" : rehearsal ? "?rehearsal=1" : "";
export const customerPhoneHref = phone => typeof phone === "string" && /^[+\d][\d ()-]{6,19}$/.test(phone) ? `tel:${phone.replace(/[ ()-]/g, "")}` : null;
export const customerMapHref = address => typeof address === "string" && address.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}` : null;

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
