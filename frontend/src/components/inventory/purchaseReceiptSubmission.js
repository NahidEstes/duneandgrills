export function receiptSubmission(lines, notes, key) {
  const items = Object.entries(lines).filter(([, row]) => row.selected).map(([lineId, row]) => ({
    lineId, quantity: Number(row.quantity), brand: row.brand,
    lotNumber: row.lotNumber.trim() || null, receivedAt: row.receivedAt || null,
    expiryDate: row.expiryDate || null, notes: row.notes || "", overrideReason: row.overrideReason || "",
  }));
  if (!items.length) throw new Error("Select at least one delivered item.");
  if (items.some(row => !Number.isFinite(row.quantity) || row.quantity <= 0)) throw new Error("Selected receipt quantities must be greater than zero.");
  return { items, notes, idempotencyKey: key };
}

export const receiptStorageKey = (orderId, actorId) => `dg-purchase-receipt:${actorId}:${orderId}`;
// Only explicit validation failures mean no transaction committed. Network/5xx outcomes stay locked.
export const receiptCanBeCorrected = error => [400, 422].includes(error?.response?.status);
