"use client";

import { serverClockOffset } from "../../pwa/network.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchKitchenQueue, updateKitchenOrderStatus, handoffKitchenOrder } from "../../api/api.js";
import { DEFAULT_NOTIFICATION_SETTINGS, normalizeNotificationSettings } from "../../utils/notificationSettings.js";

export default function useKitchenQueue(filters) {
  const [orders, setOrders] = useState([]);
  const [config, setConfig] = useState({
    defaultPreparationMinutes: 20,
    readyRetentionMinutes: 30,
    notifications: {
      soundEnabled: DEFAULT_NOTIFICATION_SETTINGS.kitchenSoundEnabled,
      alertRepeatIntervalSeconds: DEFAULT_NOTIFICATION_SETTINGS.alertRepeatIntervalSeconds,
      maximumAlertRepeats: DEFAULT_NOTIFICATION_SETTINGS.maximumAlertRepeats,
      pollingIntervalSeconds: DEFAULT_NOTIFICATION_SETTINGS.pollingIntervalSeconds,
    },
  });
  const [connection, setConnection] = useState("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [error, setError] = useState("");
  const [updatingIds, setUpdatingIds] = useState(() => new Set());
  const [refreshVersion, setRefreshVersion] = useState(0);
  const busyIds = useRef(new Set());
  const [realtime, setRealtime] = useState(false);

  const refresh = useCallback(() => setRefreshVersion((value) => value + 1), []);
  useEffect(() => {
    if (!window.EventSource) return;
    let events; let debounce; let retry; let disposed = false;
    const connect = () => {
      window.clearTimeout(retry);
      events?.close();
      if (disposed || navigator.onLine === false) return;
      events = new EventSource("/api/kitchen/events", { withCredentials: true });
      events.addEventListener("connected", () => setRealtime(true));
      events.addEventListener("orders-changed", () => { window.clearTimeout(debounce); debounce = window.setTimeout(refresh, 150); });
      events.addEventListener("polling-required", () => { setRealtime(false); events.close(); retry = window.setTimeout(connect, 30_000); });
      events.onerror = () => setRealtime(false); // EventSource reconnects; polling stays active.
    };
    const disconnect = () => { events?.close(); window.clearTimeout(retry); setRealtime(false); };
    connect(); window.addEventListener("online", connect); window.addEventListener("offline", disconnect);
    return () => { disposed = true; events?.close(); window.clearTimeout(debounce); window.clearTimeout(retry); window.removeEventListener("online", connect); window.removeEventListener("offline", disconnect); };
  }, [refresh]);

  useEffect(() => {
    let disposed = false;
    let timerId;
    let requestInFlight = false;
    let failures = 0;
    let unauthorized = false;
    let pollingIntervalMs = DEFAULT_NOTIFICATION_SETTINGS.pollingIntervalSeconds * 1000;

    const schedule = () => {
      if (disposed || unauthorized) return;
      const delay = document.visibilityState === "hidden"
        ? Math.max(10_000, pollingIntervalMs * 3)
        : pollingIntervalMs;
      timerId = window.setTimeout(load, delay);
    };

    const load = async () => {
      if (disposed || unauthorized || requestInFlight) return;
      window.clearTimeout(timerId);
      requestInFlight = true;
      try {
        if (navigator.onLine === false) throw new Error("Offline. Reconnect to refresh the kitchen queue.");
        const startedAt = Date.now();
        const payload = await fetchKitchenQueue(filters);
        if (disposed) return;
        const receivedAt = Date.now();
        setOrders(payload.data || []);
        const incomingConfig = payload.config || {};
        const normalizedNotifications = normalizeNotificationSettings({
          kitchenSoundEnabled: incomingConfig.notifications?.soundEnabled,
          ...incomingConfig.notifications,
        });
        pollingIntervalMs = normalizedNotifications.pollingIntervalSeconds * 1000;
        setConfig((current) => ({
          ...current,
          ...incomingConfig,
          notifications: {
            soundEnabled: normalizedNotifications.kitchenSoundEnabled,
            alertRepeatIntervalSeconds: normalizedNotifications.alertRepeatIntervalSeconds,
            maximumAlertRepeats: normalizedNotifications.maximumAlertRepeats,
            pollingIntervalSeconds: normalizedNotifications.pollingIntervalSeconds,
          },
        }));
        setClockOffsetMs(serverClockOffset(payload.serverNow, startedAt, receivedAt));
        setLastUpdatedAt(receivedAt);
        setConnection("connected");
        setError("");
        failures = 0;
      } catch (requestError) {
        if (disposed) return;
        if ([401, 403].includes(requestError.response?.status)) {
          unauthorized = true;
          setOrders([]); setRealtime(false); setConnection("unauthorized");
          setError("Kitchen access expired or was revoked. Sign in again.");
          return;
        }
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
    window.addEventListener("online", load);
    const handleOffline = () => { setConnection("disconnected"); setError("Offline. Reconnect before changing an order."); };
    window.addEventListener("offline", handleOffline);
    return () => {
      disposed = true;
      window.clearTimeout(timerId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", load);
      window.removeEventListener("online", load);
      window.removeEventListener("offline", handleOffline);
    };
  }, [filters, refreshVersion]);

  const transition = useCallback(async (orderId, status, options = {}) => {
    if (navigator.onLine === false) throw new Error("Offline. Reconnect before changing an order.");
    const id = String(orderId);
    if (busyIds.current.has(id)) return;
    busyIds.current.add(id);
    setUpdatingIds((current) => new Set(current).add(String(orderId)));
    try {
      const request = ["out-for-delivery", "delivered"].includes(status) ? handoffKitchenOrder : updateKitchenOrderStatus;
      const startedAt = Date.now();
      const response = await request(orderId, status, options);
      setClockOffsetMs(serverClockOffset(response.serverNow, startedAt, Date.now()));
      refresh();
      return response.data;
    } finally {
      busyIds.current.delete(id);
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(String(orderId));
        return next;
      });
    }
  }, [refresh]);

  return { orders, config, connection, realtime, lastUpdatedAt, clockOffsetMs, error, updatingIds, refresh, transition };
}
