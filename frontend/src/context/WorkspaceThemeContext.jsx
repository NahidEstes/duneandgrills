"use client";

import { createContext, useContext, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isThemedWorkspace, normalizeWorkspaceTheme, workspaceThemeKey } from "../theme/workspaceTheme.js";

const WorkspaceThemeContext = createContext({ theme: "dark", toggleTheme: () => {}, storageError: "" });

export function WorkspaceThemeProvider({ children }) {
  const pathname = usePathname(), enabled = isThemedWorkspace(pathname);
  const [preference, setPreference] = useState("dark"), [storageError, setStorageError] = useState("");

  useLayoutEffect(() => {
    try { setPreference(normalizeWorkspaceTheme(localStorage.getItem(workspaceThemeKey))); }
    catch { /* Keep the working, in-memory preference when storage is blocked. */ }
    const sync = event => {
      if (event.key === workspaceThemeKey || event.key === null) {
        setPreference(normalizeWorkspaceTheme(event.newValue)); setStorageError("");
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useLayoutEffect(() => {
    if (enabled) document.documentElement.dataset.workspaceTheme = preference;
    else delete document.documentElement.dataset.workspaceTheme;
  }, [enabled, preference]);

  const toggleTheme = () => {
    const next = preference === "dark" ? "light" : "dark";
    setPreference(next);
    try { localStorage.setItem(workspaceThemeKey, next); setStorageError(""); }
    catch { setStorageError("Theme changed for this visit. Browser storage is unavailable, so it cannot be remembered after reload."); }
  };

  return <WorkspaceThemeContext.Provider value={{ theme: enabled ? preference : "dark", toggleTheme, storageError }}>{children}</WorkspaceThemeContext.Provider>;
}

export const useWorkspaceTheme = () => useContext(WorkspaceThemeContext);
