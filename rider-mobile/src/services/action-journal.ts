import { definiteRejection } from '../domain/rider';
import type { Pending } from '../domain/types';
type Store = { write: (key: string, value: unknown) => Promise<void>; remove: (key: string) => Promise<void> };
export const JOURNAL = 'dg.rider.pending.v1';
// No background retry or offline queue: only an explicit user call reaches send.
export async function prepareAction(saved: Pending, store: Store, changed: (pending: Pending | null) => void, send: () => Promise<void>) {
  await store.write(JOURNAL, saved);
  changed(saved);
  await send();
}
export async function settleAction(store: Store, changed: (pending: Pending | null) => void, send: () => Promise<unknown>) {
  try { await send(); }
  catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0;
    if (definiteRejection(status)) { await store.remove(JOURNAL); changed(null); }
    throw error;
  }
  // A confirmed write with failed local cleanup remains saved and safely replayable.
  await store.remove(JOURNAL); changed(null);
}
