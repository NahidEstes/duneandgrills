"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRiderPortal } from "../api/riderApi.js";

export default function useRiderPortal(user, preview, rehearsal = false, status = "all", history = false, page = 1) {
  const [state, setState] = useState({ data: null, loading: true, error: "", updatedAt: null, denied: false });
  const [retry, setRetry] = useState(0);
  const pending = useRef(false);
  const refresh = useCallback(() => { if (!pending.current) setRetry(value => value + 1); }, []);
  useEffect(() => {
    if (!user || !["admin", "rider"].includes(user.role)) return;
    const controller = new AbortController();
    let current = true;
    pending.current = true;
    // Clear the prior actor/mode's data rather than relabeling it during navigation.
    setState({ data: null, loading: true, error: "", updatedAt: null, denied: false });
    fetchRiderPortal(preview, controller.signal, { rehearsal, status, history, page }).then(data => {
      if (current) setState({ data, loading: false, error: "", updatedAt: new Date(), denied: false });
    }).catch(error => {
      if (!current) return;
      const denied = [401, 403].includes(error.response?.status);
      setState({ data: null, loading: false, updatedAt: null, denied,
        error: error.response?.data?.message || (navigator.onLine ? error.message || "Rider portal could not be loaded." : "You are offline. Reconnect and retry.") });
    }).finally(() => { if (current) pending.current = false; });
    return () => { current = false; controller.abort(); pending.current = false; };
  }, [user, preview, retry, rehearsal, status, history, page]);
  return { ...state, refresh };
}
