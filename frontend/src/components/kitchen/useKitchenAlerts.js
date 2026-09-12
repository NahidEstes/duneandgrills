"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KITCHEN_ALERT_REPEAT_MS } from "./kitchenConfig.js";
import {
  mergeAcknowledgedKitchenOrderIds,
  pendingKitchenOrderIds,
  unacknowledgedKitchenOrderIds,
} from "./kitchenAlertUtils.js";

const STORAGE_KEY = "dg_kitchen_acknowledged_orders";

export default function useKitchenAlerts(orders) {
  const [acknowledgedIds, setAcknowledgedIds] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) setAcknowledgedIds(saved.map(String).slice(-500));
    } catch {
      setAcknowledgedIds([]);
    }
  }, []);

  const pendingIds = useMemo(() => pendingKitchenOrderIds(orders), [orders]);
  const unacknowledgedIds = useMemo(
    () => unacknowledgedKitchenOrderIds(orders, acknowledgedIds),
    [acknowledgedIds, orders]
  );

  const playAlert = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || context.state !== "running") return;
    [0, 0.22].forEach((offset) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(offset ? 880 : 740, context.currentTime + offset);
      gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offset + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + offset);
      oscillator.stop(context.currentTime + offset + 0.18);
    });
  }, []);

  useEffect(() => {
    if (!soundEnabled || !unacknowledgedIds.length) return undefined;
    playAlert();
    const intervalId = window.setInterval(playAlert, KITCHEN_ALERT_REPEAT_MS);
    return () => window.clearInterval(intervalId);
  }, [playAlert, soundEnabled, unacknowledgedIds.length]);

  useEffect(
    () => () => {
      audioContextRef.current?.close().catch(() => undefined);
    },
    []
  );

  const enableSound = async () => {
    try {
      if (!audioContextRef.current) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContext();
      }
      await audioContextRef.current.resume();
      setSoundEnabled(true);
      playAlert();
      return true;
    } catch {
      setSoundEnabled(false);
      return false;
    }
  };

  const acknowledge = () => {
    const next = mergeAcknowledgedKitchenOrderIds(acknowledgedIds, pendingIds);
    setAcknowledgedIds(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* In-memory acknowledgement still works. */ }
  };

  return {
    soundEnabled,
    enableSound,
    muteSound: () => setSoundEnabled(false),
    acknowledge,
    pendingCount: pendingIds.length,
    unacknowledgedCount: unacknowledgedIds.length,
  };
}
