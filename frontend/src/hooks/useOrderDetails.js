"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOrderById } from "../api/api.js";

// Independent of the paginated list. Ignore old/unmounted responses, including
// servers that finish a request after cancellation.
export function useOrderDetails(id, onUnauthorized) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const unauthorized = useRef(onUnauthorized);
  useEffect(() => { unauthorized.current = onUnauthorized; }, [onUnauthorized]);
  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    const controller = new AbortController();
    setResult({ id, loading: true, data: null, error: null });
    fetchOrderById(id, { signal: controller.signal }).then(data => {
      if (active) setResult({ id, loading: false, data, error: null });
    }).catch(error => {
      if (!active) return;
      const status = error.response?.status;
      if (status === 401) unauthorized.current?.(error);
      setResult({ id, loading: false, data: null, error: status === 404 || status === 403
        ? "This order is unavailable or you do not have access."
        : status === 401 ? "Session expired. Please sign in again."
        : error.message === "Invalid order link" ? error.message : "Unable to load this order. Please retry.", retryable: ![401, 403, 404].includes(status) && error.message !== "Invalid order link" });
    });
    return () => { active = false; controller.abort(); };
  }, [id, revision]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  const update = useCallback(data => setResult({ id, data, loading: false, error: null }), [id]);
  return { ...(result?.id === id ? result : { data: null, loading: Boolean(id), error: null }), reload, update };
}
