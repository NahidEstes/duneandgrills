"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchOrderConfig, fetchPublicRestaurantSettings } from "../api/api.js";
const Context = createContext(null);
export function PublicRestaurantProvider({ children, enabled }) {
  const [state, setState] = useState({ settings: null, orderConfig: null, configLoading: true, configError: "" });
  const pending = useRef(null), generation = useRef(0);
  const refresh = useCallback(() => {
    if (!enabled) return Promise.resolve();
    if (pending.current) return pending.current;
    const token = generation.current;
    setState(value => ({ ...value, configLoading: true }));
    pending.current = Promise.allSettled([fetchPublicRestaurantSettings(), fetchOrderConfig()]).then(([settings, config]) => {
      if (token !== generation.current) return;
      const valid = config.status === "fulfilled" && typeof config.value?.websiteOrderingEnabled === "boolean" && Array.isArray(config.value?.orderTypes);
      setState(value => ({ settings: settings.status === "fulfilled" ? settings.value : value.settings,
        orderConfig: valid ? config.value : null, configLoading: false,
        configError: valid ? "" : "Ordering options are unavailable. Please retry before checking out." }));
    }).finally(() => { if (token === generation.current) pending.current = null; });
    return pending.current;
  }, [enabled]);
  useEffect(() => {
    const token = generation.current;
    refresh(); window.addEventListener("focus", refresh);
    return () => { generation.current = token + 1; pending.current = null; window.removeEventListener("focus", refresh); };
  }, [refresh]);
  return <Context.Provider value={{ ...state, refresh }}>{children}</Context.Provider>;
}
export const usePublicRestaurant = () => useContext(Context) || { settings: null, orderConfig: null, configLoading: true, configError: "", refresh: () => {} };
