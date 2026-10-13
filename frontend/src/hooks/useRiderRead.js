"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { createRiderRead, emptyRiderRead } from "../components/rider/riderReadState.js";

export default function useRiderRead(scope, queryKey, load, allowed = true) {
  const { setUser } = useAuth();
  const [state, setState] = useState(() => ({ ...emptyRiderRead(), scope }));
  const [offline, setOffline] = useState(false);
  const reader = useRef(null), loader = useRef(load), key = useRef(queryKey);
  useEffect(() => { loader.current = load; key.current = queryKey; }, [load, queryKey]);
  useEffect(() => {
    const current = createRiderRead(signal => loader.current(signal), value => {
      if (reader.current !== current) return;
      setState({ ...value, scope });
      if (value.errorStatus === 401) setUser(null);
    });
    reader.current = current;
    setState({ ...emptyRiderRead(), scope, loading: allowed });
    if (allowed) current.refresh(key.current);
    return () => { current.stop(); if (reader.current === current) reader.current = null; };
  }, [scope, allowed, setUser]);
  useEffect(() => { if (allowed) reader.current?.refresh(queryKey); }, [queryKey, allowed]);
  const refresh = useCallback(() => reader.current?.refresh(key.current), []);
  const invalidate = useCallback(() => reader.current?.invalidate(key.current), []);
  useEffect(() => {
    const connection = () => { setOffline(!navigator.onLine); if (navigator.onLine) refresh(); };
    setOffline(!navigator.onLine);
    window.addEventListener("online", connection); window.addEventListener("offline", connection);
    return () => { window.removeEventListener("online", connection); window.removeEventListener("offline", connection); };
  }, [refresh]);
  const visible = state.scope === scope && allowed ? state : { ...emptyRiderRead(), loading: allowed };
  const mode = visible.data?.mode;
  useEffect(() => {
    if (visible.denied || !["operational", "rehearsal"].includes(mode)) return;
    let lastTrigger = 0;
    const update = () => { if (document.visibilityState === "visible" && navigator.onLine && Date.now() - lastTrigger >= 1000) { lastTrigger = Date.now(); refresh(); } };
    const timer = setInterval(update, 30_000);
    window.addEventListener("focus", update); document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [mode, visible.denied, refresh]);
  return { ...visible, offline, refresh, invalidate, dismissNewAssignment: () => reader.current?.dismiss() };
}
