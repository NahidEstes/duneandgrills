"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchOrders } from "../api/api.js";
import { formatPrice } from "../utils/currency.js";

export const ADMIN_ORDER_POLL_INTERVAL_MS = 5_000;
export const ADMIN_ALERT_REPEAT_INTERVAL_MS = 10_000;

const ALERTS_STORAGE_KEY = "dg_admin_order_alerts_enabled";

const pendingSignature = (orders) =>
  orders
    .map((order) => order._id)
    .sort()
    .join("|");

export const useAdminOrderAlerts = ({ onPendingOrdersChange } = {}) => {
  const [pendingOrders, setPendingOrders] = useState([]);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const knownOrderIds = useRef(new Set());
  const signatureRef = useRef("");
  const initializedRef = useRef(false);
  const audioContextRef = useRef(null);
  const pendingCountRef = useRef(0);

  useEffect(() => {
    const stored = window.localStorage.getItem(ALERTS_STORAGE_KEY);
    if (stored === "false") setAlertsEnabled(false);
  }, []);

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
    if (!alertsEnabled) return;
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
  }, [alertsEnabled, unlockAudio]);

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
  }, []);

  const pollPendingOrders = useCallback(async () => {
    try {
      const orders = await fetchOrders("pending");
      const nextSignature = pendingSignature(orders);
      const newOrders = orders.filter(
        (order) => !knownOrderIds.current.has(order._id)
      );

      if (nextSignature !== signatureRef.current) {
        signatureRef.current = nextSignature;
        setPendingOrders(orders);
        onPendingOrdersChange?.(orders);
      }

      if (newOrders.length > 0) {
        if (initializedRef.current) {
          newOrders.forEach((order) => {
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

      knownOrderIds.current = new Set(orders.map((order) => order._id));
      initializedRef.current = true;
    } catch {
      // The normal dashboard error handling remains responsible for visible
      // connection errors. A failed background poll retries automatically.
    }
  }, [onPendingOrdersChange, showBrowserNotification]);

  useEffect(() => {
    pollPendingOrders();
    const timer = window.setInterval(
      pollPendingOrders,
      ADMIN_ORDER_POLL_INTERVAL_MS
    );
    const refreshOnFocus = () => pollPendingOrders();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [pollPendingOrders]);

  useEffect(() => {
    if (!alertsEnabled || pendingOrders.length === 0) return undefined;
    playAlert();
    const timer = window.setInterval(
      playAlert,
      ADMIN_ALERT_REPEAT_INTERVAL_MS
    );
    return () => window.clearInterval(timer);
  }, [alertsEnabled, pendingOrders.length, playAlert]);

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
    const permissionRequest =
      typeof window !== "undefined" &&
      "Notification" in window &&
      window.Notification.permission === "default"
        ? window.Notification.requestPermission().catch(() => undefined)
        : Promise.resolve();
    await unlockAudio();
    await permissionRequest;
  }, [unlockAudio]);

  const toggleAlerts = useCallback(async () => {
    const nextValue = !alertsEnabled;
    setAlertsEnabled(nextValue);
    window.localStorage.setItem(ALERTS_STORAGE_KEY, String(nextValue));
    if (nextValue) {
      await requestBrowserPermission();
      toast.success("New-order sound alerts enabled.");
    } else {
      toast.info("New-order sound alerts muted.");
    }
  }, [alertsEnabled, requestBrowserPermission]);

  const dismissPendingOrder = useCallback((orderId) => {
    setPendingOrders((current) =>
      current.filter((order) => order._id !== orderId)
    );
  }, []);

  return {
    alertsEnabled,
    dismissPendingOrder,
    pendingCount: pendingOrders.length,
    pollPendingOrders,
    requestBrowserPermission,
    toggleAlerts,
  };
};
