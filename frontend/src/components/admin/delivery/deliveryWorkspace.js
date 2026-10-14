export const emptyDeliveryQuery = (workspace = "all") => ({ workspace, search: "", status: "all", attention: "all", cashStatus: "all", datePeriod: "all", dateBasis: ["cash", "history"].includes(workspace) ? "delivered" : "enrolled", from: "", to: "", riderId: "all", sort: ["cash", "history"].includes(workspace) ? "delivered_newest" : "newest", page: 1 });
const fingerprint = row => JSON.stringify([row.revision, row.orderRevision, row.deliveryStatus, row.restaurantStatus, row.riderId, row.canOperate, row.paymentStatus, row.ledgerOutstandingHalala, row.cashReport]);

// Explicit commands only: no timers, subscriptions to browser focus, or draft inputs.
export function createDeliveryWorkspace({ list, detail, onUnauthorized = () => {}, initialQuery = emptyDeliveryQuery() }) {
  let state = { data: null, dataQuery: null, query: { ...initialQuery }, loading: false, error: "", stamp: null,
    selected: null, detailLoading: false, detailError: "", changed: false }, listener = () => {}, disposed = false;
  let listToken = 0, detailToken = 0, listController, detailController, pending, pendingSignature, locked = false;
  const publish = patch => { if (!disposed) { state = { ...state, ...patch }; listener(state); } };
  const message = error => typeof navigator !== "undefined" && navigator.onLine === false ? "You are offline. Reconnect and retry." : error.response?.data?.message || error.message || "Delivery workspace unavailable. Retry.";
  const failure = (error, field) => {
    if ([401, 403].includes(error.response?.status)) {
      listController?.abort(); detailController?.abort(); ++listToken; ++detailToken;
      pending = null; pendingSignature = null;
      publish({ data: null, selected: null, stamp: null, loading: false, detailLoading: false, [field]: message(error) });
      if (error.response.status === 401) onUnauthorized();
    } else publish({ [field]: message(error) });
  };
  const readSelected = async (id, baseline) => {
    detailController?.abort(); detailController = new AbortController(); const token = ++detailToken;
    publish({ detailLoading: true, detailError: "" });
    try {
      const result = await detail(id, detailController.signal);
      if (disposed || token !== detailToken || state.selected?.id !== id) return;
      if (result.data?.id !== id) throw Error("Unexpected selected delivery response. Retry before acting.");
      const latest = { ...result.data, mode: result.mode };
      publish({ selected: latest, selectedStamp: new Date(), changed: state.changed || (baseline ? fingerprint(baseline) !== fingerprint(latest) : false), detailLoading: false });
    } catch (error) {
      if (disposed || token !== detailToken) return;
      failure(error, "detailError"); publish({ detailLoading: false });
    }
  };
  const load = (query = state.query) => {
    if (disposed || locked) return Promise.resolve();
    const signature = JSON.stringify(query);
    if (pending && signature === pendingSignature) return pending;
    listController?.abort(); listController = new AbortController(); const token = ++listToken;
    pendingSignature = signature; publish({ query: { ...query }, loading: true, error: "" });
    pending = (async () => {
      try {
        const result = await list(query, listController.signal);
        if (disposed || token !== listToken) return;
        publish({ data: result, dataQuery: { ...query }, stamp: new Date(), loading: false });
        if (result.mode === "disabled") { detailController?.abort(); ++detailToken; publish({ selected: null, detailLoading: false }); }
        else if (state.selected) await readSelected(state.selected.id, state.selected);
      } catch (error) { if (!disposed && token === listToken) { failure(error, "error"); publish({ loading: false }); } }
      finally { if (token === listToken) { pending = null; pendingSignature = null; } }
    })();
    return pending;
  };
  return {
    snapshot: () => state,
    subscribe(callback) { listener = callback; return () => { listener = () => {}; }; },
    load,
    select(row) {
      if (locked || disposed) return false;
      detailController?.abort(); ++detailToken;
      publish({ selected: row, selectedStamp: null, changed: false, detailError: "" });
      void readSelected(row.id, row); return true;
    },
    review() { if (!locked && !state.detailLoading && !state.detailError) publish({ changed: false }); },
    lock(value) { locked = value; if (value) { listController?.abort(); detailController?.abort(); ++listToken; ++detailToken; pending = null; publish({ loading: false, detailLoading: false }); } },
    dispose() { disposed = true; ++listToken; ++detailToken; listController?.abort(); detailController?.abort(); listener = () => {}; },
  };
}
