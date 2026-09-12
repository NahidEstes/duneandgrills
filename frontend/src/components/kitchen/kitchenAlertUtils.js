export const pendingKitchenOrderIds = (orders = []) => orders
  .filter((order) => order.status === "pending")
  .map((order) => String(order._id));

export const unacknowledgedKitchenOrderIds = (orders = [], acknowledgedIds = []) => {
  const acknowledged = new Set(acknowledgedIds.map(String));
  return pendingKitchenOrderIds(orders).filter((id) => !acknowledged.has(id));
};

export const mergeAcknowledgedKitchenOrderIds = (current = [], incoming = [], maximum = 500) => [
  ...new Set([...current.map(String), ...incoming.map(String)]),
].slice(-maximum);
