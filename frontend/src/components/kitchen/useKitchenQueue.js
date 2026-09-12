"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchKitchenQueue, updateKitchenOrderStatus } from "../../api/api.js";
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

  const refresh = useCallback(() => setRefreshVersion((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;
    let timerId;
    let requestInFlight = false;
    let failures = 0;
    let pollingIntervalMs = DEFAULT_NOTIFICATION_SETTINGS.pollingIntervalSeconds * 1000;

    const schedule = () => {
      if (disposed) return;
      const delay = document.visibilityState === "hidden"
        ? Math.max(10_000, pollingIntervalMs * 3)
        : pollingIntervalMs;
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
