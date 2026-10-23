"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchPreparationAvailability } from "@/src/api/inventoryApi.js";
import { apiErrorMessage } from "./inventoryUtils.js";

export default function usePreparationAvailability(lines, sequence = [], revision = 0) {
  const rows = new Map(lines.filter(row => row.inventoryItem).map(row => [String(row.inventoryItem), { inventoryItem: String(row.inventoryItem), ...(Number(row.quantity) > 0 && row.unit ? { quantity: row.quantity, unit: row.unit } : {}) }]));
  for (const node of sequence) if (!rows.has(node.id) && rows.size < 100) rows.set(node.id, { inventoryItem: node.id });
  const key = JSON.stringify([...rows.values()]);
  const [nonce, setNonce] = useState(0), [state, setState] = useState({ key: "", data: [], loading: false, error: "" });
  const reload = useCallback(() => setNonce(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    const inputs = JSON.parse(key);
    if (!inputs.length) { setState({ key, data: [], loading: false, error: "" }); return; }
    setState(old => ({ ...old, key, loading: true, error: "" }));
    const timer = setTimeout(async () => {
      try {
        if (!navigator.onLine) throw Error("Offline. Reconnect and refresh usable stock.");
        const result = await fetchPreparationAvailability({ items: inputs }, { signal: controller.signal });
        if (current) setState({ key, data: result.data, generatedAt: result.generatedAt, loading: false, error: "" });
      } catch (error) { if (current) setState(old => ({ ...old, key, loading: false, error: apiErrorMessage(error) })); }
    }, 200);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [key, nonce, revision]);
  useEffect(() => { window.addEventListener("focus", reload); window.addEventListener("online", reload); window.addEventListener("offline", reload); return () => { window.removeEventListener("focus", reload); window.removeEventListener("online", reload); window.removeEventListener("offline", reload); }; }, [reload]);
  return { ...state, loading: state.key !== key || state.loading, fresh: state.key === key && !state.loading && !state.error, reload };
}
