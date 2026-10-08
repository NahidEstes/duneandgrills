"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRefreshController } from "../utils/refreshController.js";

export function useFreshResource({ identity, fetcher, onData, onUnauthorized, intervalMs, retryBaseMs, retryMaxMs, pauseWhenHidden = true }) {
  const callbacks = useRef({ fetcher, onData, onUnauthorized });
  useEffect(() => { callbacks.current = { fetcher, onData, onUnauthorized }; }, [fetcher, onData, onUnauthorized]);
  const controller = useRef(null);
  const [resource, setResource] = useState({ data: null, refreshing: false, status: "loading", lastSuccessAt: null, error: null });
  useEffect(() => {
    if (!identity) return undefined;
    const instance = createRefreshController({ intervalMs, retryBaseMs, retryMaxMs, pauseWhenHidden,
      fetcher: options => callbacks.current.fetcher(options), onData: data => callbacks.current.onData?.(data),
      onUnauthorized: error => callbacks.current.onUnauthorized?.(error), onState: next => setResource({ ...next, identity }) });
    controller.current = instance; instance.start();
    return () => { instance.dispose(); if (controller.current === instance) controller.current = null; };
  }, [identity, intervalMs, retryBaseMs, retryMaxMs, pauseWhenHidden]);
  const refresh = useCallback(reason => controller.current?.refresh(reason), []);
  const stop = useCallback(() => { controller.current?.dispose(); controller.current = null; }, []);
  // A new user cannot see the previous user's response, even before effect cleanup.
  return { ...(resource.identity === identity ? resource : { data: null, refreshing: false, status: "loading", lastSuccessAt: null, error: null }), refresh, stop };
}
