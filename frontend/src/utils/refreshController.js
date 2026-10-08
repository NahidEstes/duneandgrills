// One in-flight request, one scheduler and one lifecycle generation per authenticated resource.
// Injected clocks/events make race, offline and cleanup behavior testable without a browser.
export const SUMMARY_REFRESH_MS = 60_000;

export function createRefreshController({ fetcher, onState, onData, onUnauthorized, intervalMs = SUMMARY_REFRESH_MS,
  retryBaseMs = 15_000, retryMaxMs = 300_000, pauseWhenHidden = true,
  target = window, documentTarget = document, online = () => navigator.onLine !== false,
  now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  let state = { data: null, refreshing: false, error: null, errorKind: null, lastSuccessAt: null, offline: !online(), status: "loading", failures: 0 };
  let disposed = false, stopped = false, generation = 0, timer, inFlight, abort, queuedMutation = false, mutationPending = false, lastStart = -Infinity, retryAt = 0;
  const emit = patch => { if (!disposed) { state = { ...state, ...patch }; onState?.(state); } };
  const clearTimer = () => { cancel(timer); timer = undefined; };
  const hidden = () => pauseWhenHidden && documentTarget.hidden;
  const arm = delay => {
    clearTimer();
    if (!disposed && !stopped && !hidden() && online()) timer = schedule(() => refresh("timer"), delay);
  };
  function refresh(reason = "manual") {
    if (disposed || stopped) return Promise.resolve();
    if (reason === "mutation" && inFlight) queuedMutation = true;
    if (inFlight) return inFlight;
    if (reason === "mutation") { mutationPending = true; arm(250); return Promise.resolve(); }
    if (hidden()) return Promise.resolve();
    if (!online()) {
      clearTimer(); emit({ offline: true, errorKind: "offline", error: "Browser is offline. Reconnect to update.", status: state.data === null ? "error" : "stale" });
      return Promise.resolve();
    }
    // Focus/visibility/online often arrive together. Errors also retain the scheduled backoff.
    if (["focus", "visible"].includes(reason) && (!mutationPending && (now() - lastStart < 1_000 || (state.failures && now() < retryAt)))) return Promise.resolve();
    clearTimer(); mutationPending = false; lastStart = now(); const requestGeneration = ++generation;
    const requestAbort = new AbortController(); abort = requestAbort;
    emit({ refreshing: true, offline: false, status: state.data === null ? "loading" : state.error ? "stale" : "refreshing" });
    inFlight = Promise.resolve().then(() => {
      if (disposed || stopped || requestGeneration !== generation) return undefined;
      return fetcher({ signal: requestAbort.signal });
    }).then(data => {
      if (disposed || stopped || requestGeneration !== generation) return;
      emit({ data, lastSuccessAt: now(), refreshing: false, error: null, errorKind: null, status: "success", failures: 0 });
      onData?.(data);
    }).catch(error => {
      if (disposed || stopped || requestGeneration !== generation) return;
      const status = error.response?.status;
      const errorKind = !online() ? "offline" : status === 401 ? "session" : status === 403 ? "permission" : "server";
      const message = errorKind === "offline" ? "Browser is offline. Reconnect to update." : errorKind === "session" ? "Session expired. Please sign in again." : errorKind === "permission" ? "Access is no longer available." : error.response?.data?.message || "API/server unavailable. Retained data may be outdated.";
      stopped = status === 401 || status === 403;
      retryAt = now() + Math.min(retryMaxMs, retryBaseMs * 2 ** Math.min(state.failures, 10));
      emit({ refreshing: false, offline: errorKind === "offline", errorKind, error: message, failures: state.failures + 1, status: state.data === null ? "error" : "stale" });
      if (stopped) onUnauthorized?.(error);
    }).finally(() => {
      if (disposed || requestGeneration !== generation) return;
      inFlight = null;
      if (queuedMutation && !stopped) { queuedMutation = false; arm(1_000); }
      else arm(state.failures ? Math.min(retryMaxMs, retryBaseMs * 2 ** Math.min(state.failures - 1, 10)) : intervalMs);
    });
    return inFlight;
  }
  const focus = () => refresh("focus");
  const visibility = () => {
    if (documentTarget.hidden) { if (pauseWhenHidden) clearTimer(); return; }
    refresh("visible");
    if (!inFlight) arm(state.failures ? Math.max(1, retryAt - now()) : intervalMs);
  };
  const offline = () => {
    clearTimer(); ++generation; abort?.abort(); inFlight = null;
    emit({ refreshing: false, offline: true, errorKind: "offline", error: "Browser is offline. Reconnect to update.", status: state.data === null ? "error" : "stale" });
  };
  const connected = () => { if (!stopped && state.offline) { emit({ offline: false, failures: 0 }); refresh("online"); } };
  const listeners = [[target, "focus", focus], [target, "offline", offline], [target, "online", connected], [documentTarget, "visibilitychange", visibility]];
  listeners.forEach(([object, event, listener]) => object.addEventListener(event, listener));
  return {
    start: () => refresh("initial"), refresh, getState: () => state,
    dispose() { disposed = true; stopped = true; ++generation; abort?.abort(); clearTimer(); listeners.forEach(([object, event, listener]) => object.removeEventListener(event, listener)); },
  };
}
