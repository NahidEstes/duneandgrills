import { pendingSubmission, submissionStorageKey, submitPersisted } from "./persistedSubmission.js";
import { reconcileOrderRequest } from "./orderRequestRecovery.js";

const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, stable(value[key])])) : value;

export function submitCustomerOrder({ storage, actorId, payload, send, createKey }) {
  const key = submissionStorageKey("customer-order", actorId || "guest");
  const pending = pendingSubmission(storage, key);
  if (pending) {
    const { idempotencyKey, ...original } = pending;
    if (JSON.stringify(stable(original)) !== JSON.stringify(stable(payload))) {
      throw new Error("The previous order outcome is unknown. Restore its original items and customer details to retry it before placing a different order.");
    }
  }
  return submitPersisted({ storage, key, payload, send, createKey });
}
export const pendingCustomerOrder = (storage, actorId) => pendingSubmission(storage, submissionStorageKey("customer-order", actorId || "guest"));
export const reconcileCustomerOrder = ({ storage, actorId, send }) => reconcileOrderRequest({ storage, key: submissionStorageKey("customer-order", actorId || "guest"), send });
export const retryCustomerOrder = ({ storage, actorId, send }) => {
  const payload = pendingCustomerOrder(storage, actorId);
  if (!payload) throw new Error("No unresolved order request exists");
  return submitPersisted({ storage, key: submissionStorageKey("customer-order", actorId || "guest"), payload, send });
};
