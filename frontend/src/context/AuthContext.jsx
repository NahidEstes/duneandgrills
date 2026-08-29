"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loginUser, registerUser, fetchMe } from "../api/api.js";
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
    if (!token) {
      restoreGuestCart();
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const restoreSession = async () => {
      try {
        const currentUser = await fetchMe();
        if (cancelled) return;
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
    localStorage.setItem("dg_token", data.token);
    setUser(data.user);
    await migrateGuestCart(data.user._id).catch(() => undefined);
    return data.user;
  };

  const register = async (payload) => {
    const data = await registerUser(payload);
    localStorage.setItem("dg_token", data.token);
    setUser(data.user);
    await migrateGuestCart(data.user._id).catch(() => undefined);
    return data.user;
  };

  const logout = () => {
    clearCartOnLogout(user?._id);
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
