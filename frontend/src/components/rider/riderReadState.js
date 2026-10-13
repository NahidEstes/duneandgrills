export const emptyRiderRead = () => ({ data: null, loading: false, refreshing: false, error: "", errorStatus: null, denied: false, updatedAt: null, dataKey: null, newAssignment: false });

// Read-only latest-wins controller, shared by rider list/details only.
export function createRiderRead(load, changed, now = () => new Date()) {
  let state = emptyRiderRead(), sequence = 0, pending = null, controller, stopped = false, assignments;
  const publish = next => { state = next; changed(state); };
  return {
    refresh(key) {
      if (stopped || state.denied) return Promise.resolve();
      if (pending?.key === key) return pending.promise;
      controller?.abort(); controller = new AbortController();
      const signal = controller.signal, token = ++sequence;
      // A stale warning remains until a successful response actually verifies the data.
      publish({ ...state, loading: !state.data, refreshing: !!state.data });
      const promise = Promise.resolve().then(() => stopped || token !== sequence ? undefined : load(signal)).then(data => {
        if (stopped || token !== sequence) return;
        const sameMode = !state.data || state.data.mode === data.mode;
        const count = data.assignmentCount;
        const newAssignment = sameMode && Number.isSafeInteger(count) && assignments != null && count > assignments;
        if (Number.isSafeInteger(count)) assignments = count;
        publish({ ...emptyRiderRead(), data, dataKey: key, updatedAt: now(), newAssignment: sameMode && (state.newAssignment || newAssignment) });
      }).catch(error => {
        if (stopped || token !== sequence) return;
        const status = error.response?.status;
        const denied = [401, 403, 404].includes(status) || error.response?.data?.code === "LIVE_DELIVERY_DISABLED";
        publish({ ...(denied ? emptyRiderRead() : state), loading: false, refreshing: false, denied, errorStatus: status || null,
          error: error.response?.data?.message || error.message || "Workspace unavailable." });
      }).finally(() => { if (token === sequence) pending = null; });
      pending = { key, promise }; return promise;
    },
    dismiss() { publish({ ...state, newAssignment: false }); },
    invalidate(key) { return pending ? pending.promise.then(() => this.refresh(key)) : this.refresh(key); },
    stop() { stopped = true; ++sequence; controller?.abort(); pending = null; },
  };
}
