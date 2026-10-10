import { pendingSubmission } from "./persistedSubmission.js";

export async function reconcileOrderRequest({ storage, key, send }) {
  const request = pendingSubmission(storage, key);
  if (!request) throw new Error("No unresolved order request exists");
  const result = await send(request);
  if (result.cancelled !== true && !result.data?._id) throw new Error("The order outcome is still unknown. Retry reconciliation.");
  // A second tab may have replaced this entry while the request was in flight.
  if (pendingSubmission(storage, key)?.idempotencyKey === request.idempotencyKey) storage.removeItem(key);
  return result;
}
