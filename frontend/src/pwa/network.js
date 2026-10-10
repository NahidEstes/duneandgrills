let activeWrites = 0;
export function networkEvent(detail) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("dg-network", { detail }));
}
export function beginWrite() { activeWrites += 1; networkEvent({ activeWrites }); }
export function endWrite() { activeWrites = Math.max(0, activeWrites - 1); networkEvent({ activeWrites }); }
export function hasUnresolvedWrite(storages = []) {
  return storages.some(storage => {
    try {
      for (let i = 0; i < storage.length; i += 1) if (storage.key(i)?.startsWith("dg-submission:")) return true;
      return false;
    } catch { return true; } // Fail safely when persistence cannot be inspected.
  });
}
export function updateBlocked(storages) { return activeWrites > 0 || hasUnresolvedWrite(storages); }
export function updateBlockedForWindow(target) {
  try { return updateBlocked([target.localStorage, target.sessionStorage]); }
  catch { return true; }
}
export function serverClockOffset(serverNow, startedAt, receivedAt) {
  const value = Date.parse(serverNow);
  return Number.isFinite(value) ? value - (startedAt + receivedAt) / 2 : 0;
}
