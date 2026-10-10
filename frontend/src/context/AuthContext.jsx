"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loginUser, registerUser, fetchMe, logoutUser, migrateLegacySession } from "../api/api.js";
import { useCart } from "./CartContext.jsx";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [restoreVersion, setRestoreVersion] = useState(0);
  const {
    clearCartOnLogout,
    migrateGuestCart,
    restoreGuestCart,
    restoreUserCart,
  } = useCart();

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("dg_token");
    const restoreSession = async () => {
      try {
        const currentUser = token ? await migrateLegacySession() : await fetchMe();
        if (cancelled) return;
        if (token) localStorage.removeItem("dg_token");
        setSessionError("");
        setUser(currentUser);
        await restoreUserCart(currentUser._id).catch(() => undefined);
      } catch (error) {
        if (cancelled) return;
        if ([401, 403].includes(error.response?.status)) {
          localStorage.removeItem("dg_token");
          setUser(null); setSessionError("");
          restoreGuestCart();
        } else setSessionError("Session could not be verified. Reconnect and retry; your saved work is retained.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    restoreSession();
    const retry = () => { if (!cancelled) restoreSession(); };
    window.addEventListener("online", retry);
    return () => {
      cancelled = true;
      window.removeEventListener("online", retry);
    };
  }, [restoreGuestCart, restoreUserCart, restoreVersion]);

  const login = async (email, password) => {
    const data = await loginUser({ email, password });
    localStorage.removeItem("dg_token");
    setUser(data.user);
    setSessionError("");
    await migrateGuestCart(data.user._id).catch(() => undefined);
    return data.user;
  };

  const register = async (payload) => {
    const data = await registerUser(payload);
    localStorage.removeItem("dg_token");
    setUser(data.user);
    setSessionError("");
    await migrateGuestCart(data.user._id).catch(() => undefined);
    return data.user;
  };

  const logout = async () => {
    try { await logoutUser(); }
    catch { setSessionError("Logout could not be confirmed. Reconnect and retry logout before leaving this device."); return false; }
    clearCartOnLogout(user?._id);
    localStorage.removeItem("dg_token");
    setUser(null);
    setSessionError("");
    router.replace("/");
  };

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, sessionError, retrySession: () => setRestoreVersion(value => value + 1), login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};
