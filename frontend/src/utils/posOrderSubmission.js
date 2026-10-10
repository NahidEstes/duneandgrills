import { pendingSubmission, submissionStorageKey, submitPersisted } from "./persistedSubmission.js";
import { reconcileOrderRequest } from "./orderRequestRecovery.js";
const keyFor = (actorId, terminal) => submissionStorageKey("pos-order", actorId, terminal);
export const pendingPosOrder = (storage, actorId, terminal) => pendingSubmission(storage, keyFor(actorId, terminal));
export const reconcilePosOrder = ({ storage, actorId, terminal, send }) => reconcileOrderRequest({ storage, key: keyFor(actorId, terminal), send });
export function submitPosOrder({ storage, actorId, terminal, payload, send }) {
  const key = keyFor(actorId, terminal);
  if (pendingSubmission(storage, key)) throw new Error("The previous sale outcome is unknown. Retry the original payment request before completing another sale.");
  return submitPersisted({ storage, key, payload, send, createKey: () => payload.idempotencyKey || crypto.randomUUID() });
}
export function retryPosOrder({ storage, actorId, terminal, send }) {
  const key = keyFor(actorId, terminal); const payload = pendingSubmission(storage, key);
  if (!payload) throw new Error("No unresolved POS sale exists");
  return submitPersisted({ storage, key, payload, send });
}
