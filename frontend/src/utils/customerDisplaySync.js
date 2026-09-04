const VERSION = 1;
export const isDisplaySession = (value) => typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
const channelName = (session) => `dg-customer-display:${session}`;
const isAmount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

// Explicit allowlist at both ends: never spread POS/customer/order objects.
export function customerSafeBill(value) {
  if (!value || !Array.isArray(value.items) || !value.items.length) return null;
  if (value.items.length > 100 || ![value.subtotal, value.discount, value.total].every(isAmount)) return null;
  if (value.items.some((item) => !item || typeof item.name !== "string" || !Number.isInteger(item.quantity) || item.quantity < 1 || !isAmount(item.unitPrice) || !isAmount(item.lineTotal))) return null;
  return {
    items: value.items.map((item) => ({ name: item.name.slice(0, 200), quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal })),
    subtotal: value.subtotal,
    discount: value.discount,
    total: value.total,
    orderType: ["dine-in", "takeaway"].includes(value.orderType) ? value.orderType : null,
    status: ["awaiting-payment", "processing"].includes(value.status) ? value.status : null,
  };
}

export function startDisplayPublisher(session, getBill, { heartbeatMs = 2000 } = {}) {
  if (!isDisplaySession(session)) throw new Error("Invalid customer display session");
  const channel = new BroadcastChannel(channelName(session));
  const publish = () => channel.postMessage({ version: VERSION, type: "snapshot", bill: customerSafeBill(getBill()) });
  // A display may request a snapshot, but can never change any POS state.
  channel.onmessage = ({ data }) => {
    if (data?.version === VERSION && data.type === "request") publish();
  };
  const timer = setInterval(publish, heartbeatMs);
  publish();
  return {
    publish,
    disconnect: () => channel.postMessage({ version: VERSION, type: "disconnected" }),
    close() {
      clearInterval(timer);
      channel.postMessage({ version: VERSION, type: "disconnected" });
      channel.close();
    },
  };
}

export function startDisplayReceiver(session, onUpdate, { pollMs = 2000, staleMs = 7000 } = {}) {
  if (!isDisplaySession(session)) throw new Error("Invalid customer display session");
  const channel = new BroadcastChannel(channelName(session));
  let lastSeen = Date.now();
  let connection = "connecting";
  const request = () => channel.postMessage({ version: VERSION, type: "request" });
  channel.onmessage = ({ data }) => {
    if (data?.version !== VERSION) return;
    if (data.type === "snapshot") {
      lastSeen = Date.now();
      connection = "connected";
      onUpdate({ connection, bill: customerSafeBill(data.bill) });
    } else if (data.type === "disconnected") {
      connection = "disconnected";
      onUpdate({ connection, bill: null });
    }
  };
  onUpdate({ connection, bill: null });
  request();
  const timer = setInterval(() => {
    if (Date.now() - lastSeen > staleMs && connection !== "disconnected") {
      connection = "disconnected";
      onUpdate({ connection, bill: null });
    }
    request();
  }, pollMs);
  return { request, close() { clearInterval(timer); channel.close(); } };
}
