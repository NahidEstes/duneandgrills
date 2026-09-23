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
        setUser(currentUser);
        await restoreUserCart(currentUser._id).catch(() => undefined);
      } catch {
        if (cancelled) return;
        localStorage.removeItem("dg_token");
        setUser(null);
        restoreGuestCart();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, [restoreGuestCart, restoreUserCart]);

  const login = async (email, password) => {
    const data = await loginUser({ email, password });
    localStorage.removeItem("dg_token");
    setUser(data.user);
    await migrateGuestCart(data.user._id).catch(() => undefined);
    return data.user;
  };

  const register = async (payload) => {
    const data = await registerUser(payload);
    localStorage.removeItem("dg_token");
    setUser(data.user);
    await migrateGuestCart(data.user._id).catch(() => undefined);
    return data.user;
  };

  const logout = async () => {
    clearCartOnLogout(user?._id);
    await logoutUser().catch(() => undefined);
    localStorage.removeItem("dg_token");
    setUser(null);
    router.replace("/");
  };

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, login, register, logout }}
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
