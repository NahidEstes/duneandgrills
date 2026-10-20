"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { resolveTableQr } from "@/src/api/api.js";
import { useAuth } from "./AuthContext.jsx";

const TableOrderingContext = createContext(null);
const storageKey = "dg_dining_table_token";
export function TableOrderingProvider({ children }) {
  const [context, setContext] = useState({ token: "", table: null, status: "idle", error: "" });
  const request = useRef(null), generation = useRef(0);
  const pathname = usePathname(), { user } = useAuth(), previousUser = useRef(null);
  const enabled = !/^\/(admin|inventory|pos|kitchen|staff-clock|rider)(\/|$)/.test(pathname);
  const clearTable = useCallback(() => {
    generation.current++; request.current?.abort();
    const url = new URL(window.location.href);
    if (url.searchParams.has("table")) { url.searchParams.delete("table"); window.history.replaceState(null, "", url.pathname + url.search + url.hash); }
    try { sessionStorage.removeItem(storageKey); } catch { /* Session-only context still works. */ }
    setContext({ token: "", table: null, status: "idle", error: "" });
  }, []);
  const selectTable = useCallback(async token => {
    request.current?.abort();
    const controller = new AbortController(), version = ++generation.current;
    request.current = controller;
    setContext({ token, table: null, status: "loading", error: "" });
    try {
      const table = await resolveTableQr(token, { signal: controller.signal });
      if (generation.current !== version) return;
      try { sessionStorage.setItem(storageKey, token); } catch { /* Keep in memory. */ }
      setContext({ token, table, status: "ready", error: "" });
    } catch (error) {
      if (controller.signal.aborted || generation.current !== version) return;
      try { sessionStorage.removeItem(storageKey); } catch { /* Nothing to clear. */ }
      setContext({ token, table: null, status: "error", error: error.response?.data?.message || "Unable to verify this table. Retry or continue without a table." });
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    // The menu handles an explicit scan. Do not race it with a saved table.
    if (new URL(window.location.href).searchParams.has("table")) return;
    try { const token = sessionStorage.getItem(storageKey); if (token) selectTable(token); } catch { /* Storage is optional. */ }
    return () => request.current?.abort();
  }, [enabled, selectTable]);
  useEffect(() => {
    if (previousUser.current && !user?._id) clearTable();
    previousUser.current = user?._id || null;
  }, [user?._id, clearTable]);
  return <TableOrderingContext.Provider value={{ ...context, clearTable, selectTable }}>{children}</TableOrderingContext.Provider>;
}
export const useTableOrdering = () => useContext(TableOrderingContext);
