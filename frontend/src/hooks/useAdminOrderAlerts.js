"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchOrders, fetchRestaurantSettings } from "../api/api.js";
import { useFreshResource } from "./useFreshResource.js";
import { useAuth } from "../context/AuthContext.jsx";
import { formatPrice } from "../utils/currency.js";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  normalizeNotificationSettings,
  RESTAURANT_SETTINGS_UPDATED_EVENT,
} from "../utils/notificationSettings.js";

const ALERTS_STORAGE_KEY = "dg_admin_order_alerts_enabled";

const pendingSignature = (orders) =>
  orders
    .map((order) => order._id)
    .sort()
    .join("|");

export const useAdminOrderAlerts = ({ onPendingOrdersChange, onUnauthorized } = {}) => {
  const { user } = useAuth();
  const identity = user ? `${user._id}:${user.role}` : "";
  const [pendingOrders, setPendingOrders] = useState([]);
  const [hasSuccessfulPoll, setHasSuccessfulPoll] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [notificationSettings, setNotificationSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const knownOrderIds = useRef(new Set());
  const signatureRef = useRef("");
  const initializedRef = useRef(false);
  const audioContextRef = useRef(null);
  const pendingCountRef = useRef(0);

  useEffect(() => {
    const stored = window.localStorage.getItem(ALERTS_STORAGE_KEY);
    if (stored === "false") setAlertsEnabled(false);
  }, []);

  const settingsHealth = useFreshResource({
    identity, fetcher: ({ signal }) => fetchRestaurantSettings({ signal, timeout: 20_000 }),
    intervalMs: 300_000, onUnauthorized,
    onData: settings => setNotificationSettings(normalizeNotificationSettings(settings?.notifications)),
  });
  const refreshSettings = settingsHealth.refresh;
  const stopSettings = settingsHealth.stop;
  useEffect(() => {
    const apply = event => {
      setNotificationSettings(normalizeNotificationSettings(event.detail?.notifications));
      refreshSettings("mutation");
    };
    window.addEventListener(RESTAURANT_SETTINGS_UPDATED_EVENT, apply);
    return () => window.removeEventListener(RESTAURANT_SETTINGS_UPDATED_EVENT, apply);
  }, [refreshSettings]);

  useEffect(() => {
    pendingCountRef.current = pendingOrders.length;
  }, [pendingOrders.length]);

  const unlockAudio = useCallback(async () => {
    if (typeof window === "undefined") return null;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume().catch(() => undefined);
    }
    return audioContextRef.current;
  }, []);

  const playAlert = useCallback(async () => {
    if (!alertsEnabled || !notificationSettings.adminSoundEnabled) return;
    const context = await unlockAudio();
    if (!context || context.state !== "running") return;

    const start = context.currentTime;
    [0, 0.22].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(index ? 1_040 : 880, start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.17);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.18);
    });
  }, [alertsEnabled, notificationSettings.adminSoundEnabled, unlockAudio]);

  const showBrowserNotification = useCallback((order) => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      window.Notification.permission !== "granted"
    ) {
      return;
    }

    const itemCount = (order.items || []).reduce(
      (total, item) => total + Number(item.quantity || 0),
      0
    );
    // Browser notification support can fail independently of a successful API poll.
    try {
      const notification = new window.Notification(
        `New order #${order.orderNumber}`,
        {
          body: `${order.customer?.name || "Customer"} · ${itemCount} item${
            itemCount === 1 ? "" : "s"
          } · ${formatPrice(order.totalAmount)}`,
          tag: `dune-order-${order._id}`,
          renotify: true,
        }
      );
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch { /* Unsupported browser/device notification; polling remains healthy. */ }
  }, []);

  const applyPendingOrders = useCallback((orders) => {
    const nextSignature = pendingSignature(orders);
    const newOrders = orders.filter(order => !knownOrderIds.current.has(order._id));

    if (nextSignature !== signatureRef.current) {
      signatureRef.current = nextSignature;
      setPendingOrders(orders);
      onPendingOrdersChange?.(orders, { initial: !initializedRef.current });
    }

    if (newOrders.length > 0) {
      if (initializedRef.current) {
        newOrders.forEach(order => {
          toast.warning(`New order #${order.orderNumber}`, {
            description: `${order.customer?.name || "Customer"} placed a new order.`,
            duration: 8_000,
          });
          showBrowserNotification(order);
        });
      } else {
        toast.info(
          `${newOrders.length} pending order${newOrders.length === 1 ? "" : "s"} need attention.`,
          { duration: 6_000 }
        );
      }
    }

    newOrders.forEach(order => knownOrderIds.current.add(order._id));
    // Keep IDs for this mounted/authenticated session; retries and reappearing pending orders must not re-notify.
    initializedRef.current = true;
    setHasSuccessfulPoll(true);
  }, [onPendingOrdersChange, showBrowserNotification]);

  const monitoring = useFreshResource({
    identity, fetcher: ({ signal }) => fetchOrders("pending", { signal, timeout: 20_000 }),
    onData: applyPendingOrders, onUnauthorized, pauseWhenHidden: false,
    intervalMs: notificationSettings.pollingIntervalSeconds * 1000,
    retryBaseMs: notificationSettings.pollingIntervalSeconds * 1000, retryMaxMs: 60_000,
  });
  const pollPendingOrders = monitoring.refresh;

  useEffect(() => {
    if (!alertsEnabled || !notificationSettings.adminSoundEnabled || pendingOrders.length === 0) return undefined;
    let repeats = 1;
    playAlert();
    const timer = window.setInterval(() => {
      if (repeats >= notificationSettings.maximumAlertRepeats) {
        window.clearInterval(timer);
        return;
      }
      repeats += 1;
      playAlert();
    }, notificationSettings.alertRepeatIntervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [alertsEnabled, notificationSettings, pendingOrders, playAlert]);

  useEffect(() => {
    if (!alertsEnabled) return undefined;
    const armAudio = () => {
      unlockAudio().then(() => {
        if (pendingCountRef.current > 0) playAlert();
      });
    };
    document.addEventListener("pointerdown", armAudio, { once: true });
    document.addEventListener("keydown", armAudio, { once: true });
    return () => {
      document.removeEventListener("pointerdown", armAudio);
      document.removeEventListener("keydown", armAudio);
    };
  }, [alertsEnabled, playAlert, unlockAudio]);

  useEffect(
    () => () => {
      audioContextRef.current?.close().catch(() => undefined);
    },
    []
  );

  const requestBrowserPermission = useCallback(async () => {
    if (!notificationSettings.adminSoundEnabled) {
      toast.info("Admin order sounds are disabled in Restaurant Settings.");
      return;
    }
    const permissionRequest =
      typeof window !== "undefined" &&
      "Notification" in window &&
      window.Notification.permission === "default"
        ? window.Notification.requestPermission().catch(() => undefined)
        : Promise.resolve();
    await unlockAudio();
    await permissionRequest;
  }, [notificationSettings.adminSoundEnabled, unlockAudio]);

  const toggleAlerts = useCallback(async () => {
    if (!notificationSettings.adminSoundEnabled) {
      toast.info("Admin order sounds are disabled in Restaurant Settings.");
      return;
    }
    const nextValue = !alertsEnabled;
    setAlertsEnabled(nextValue);
    window.localStorage.setItem(ALERTS_STORAGE_KEY, String(nextValue));
    if (nextValue) {
      await requestBrowserPermission();
      toast.success("New-order sound alerts enabled.");
    } else {
      toast.info("New-order sound alerts muted.");
    }
  }, [alertsEnabled, notificationSettings.adminSoundEnabled, requestBrowserPermission]);

  const dismissPendingOrder = useCallback((orderId) => {
    setPendingOrders((current) =>
      current.filter((order) => order._id !== orderId)
    );
  }, []);

  const stopOrderPolling = monitoring.stop;
  const stopMonitoring = useCallback(() => {
    stopOrderPolling();
    stopSettings();
    knownOrderIds.current.clear();
    signatureRef.current = "";
    initializedRef.current = false;
    setPendingOrders([]);
    setHasSuccessfulPoll(false);
  }, [stopOrderPolling, stopSettings]);

  return {
    alertsEnabled: alertsEnabled && notificationSettings.adminSoundEnabled,
    dismissPendingOrder,
    pendingCount: hasSuccessfulPoll ? pendingOrders.length : null,
    monitoring,
    settingsHealth,
    stopMonitoring,
    pollPendingOrders,
    requestBrowserPermission,
    toggleAlerts,
  };
};
