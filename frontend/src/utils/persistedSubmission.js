// Financial submissions retain their exact details/key until their outcome is known.
export const submissionStorageKey = (kind, actorId, recordId = "new") => `dg-submission:${kind}:${actorId}:${recordId}`;
export function pendingSubmission(storage, key) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("Saved submission is unreadable. Reconcile its outcome before trying again."); }
  if (!value || typeof value !== "object" || typeof value.idempotencyKey !== "string" || !value.idempotencyKey || value.idempotencyKey.length > 128) throw new Error("Saved submission is invalid. Reconcile its outcome before trying again.");
  return value;
}
export async function submitPersisted({ storage, key, payload, send, createKey = () => crypto.randomUUID() }) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("Offline. Reconnect before submitting; no new request has been queued.");
  const request = pendingSubmission(storage, key) || { ...payload, idempotencyKey: createKey() };
  // If persistence fails, do not send a request that cannot be retried safely.
  storage.setItem(key, JSON.stringify(request));
  try {
    const result = await send(request);
    storage.removeItem(key);
    return result;
  } catch (error) {
    // A network failure, 5xx or conflict is not evidence of a rolled-back write.
    if ([400, 422].includes(error.response?.status)) storage.removeItem(key);
    throw error;
  }
}
