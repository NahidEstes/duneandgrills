"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchKitchenQueue, updateKitchenOrderStatus } from "../../api/api.js";
import { KITCHEN_HIDDEN_POLL_INTERVAL_MS, KITCHEN_POLL_INTERVAL_MS } from "./kitchenConfig.js";

export default function useKitchenQueue(filters) {
  const [orders, setOrders] = useState([]);
  const [config, setConfig] = useState({ defaultPreparationMinutes: 20, readyRetentionMinutes: 30 });
  const [connection, setConnection] = useState("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [error, setError] = useState("");
  const [updatingIds, setUpdatingIds] = useState(() => new Set());
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refresh = useCallback(() => setRefreshVersion((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;
    let timerId;
    let requestInFlight = false;
    let failures = 0;

    const schedule = () => {
      if (disposed) return;
      const delay = document.visibilityState === "hidden"
        ? KITCHEN_HIDDEN_POLL_INTERVAL_MS
        : KITCHEN_POLL_INTERVAL_MS;
      timerId = window.setTimeout(load, delay);
    };

    const load = async () => {
      if (disposed || requestInFlight) return;
      requestInFlight = true;
      try {
        const payload = await fetchKitchenQueue(filters);
        if (disposed) return;
        const receivedAt = Date.now();
        setOrders(payload.data || []);
        setConfig((current) => ({ ...current, ...(payload.config || {}) }));
        setClockOffsetMs(new Date(payload.serverNow).getTime() - receivedAt);
        setLastUpdatedAt(receivedAt);
        setConnection("connected");
        setError("");
        failures = 0;
      } catch (requestError) {
        if (disposed) return;
        failures += 1;
        setConnection(failures >= 3 ? "disconnected" : "reconnecting");
        setError(requestError.response?.data?.message || "Kitchen queue is temporarily unavailable.");
      } finally {
        requestInFlight = false;
        schedule();
      }
    };

    const handleVisibility = () => {
      window.clearTimeout(timerId);
      if (document.visibilityState === "visible") load();
      else schedule();
    };

    load();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", load);
    return () => {
      disposed = true;
      window.clearTimeout(timerId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", load);
    };
  }, [filters, refreshVersion]);

  const transition = useCallback(async (orderId, status, options = {}) => {
    setUpdatingIds((current) => new Set(current).add(String(orderId)));
    try {
      const response = await updateKitchenOrderStatus(orderId, status, options);
      setClockOffsetMs(new Date(response.serverNow).getTime() - Date.now());
      refresh();
      return response.data;
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(String(orderId));
        return next;
      });
    }
  }, [refresh]);

  return { orders, config, connection, lastUpdatedAt, clockOffsetMs, error, updatingIds, refresh, transition };
}
