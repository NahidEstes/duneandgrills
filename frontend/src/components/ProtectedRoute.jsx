"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext.jsx";

// roles: e.g. ["admin", "manager"]. Leave empty to just require login.
const ProtectedRoute = ({ children, roles = [] }) => {
  const { user, loading, sessionError, retrySession, logout } = useAuth();
  const router = useRouter();
  const roleAllowed = roles.length === 0 || (user && roles.includes(user.role));

  useEffect(() => {
    if (loading || sessionError) return;
    if (!user) router.replace("/login");
    else if (!roleAllowed) router.replace("/");
  }, [loading, roleAllowed, router, user, sessionError]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-neutral-400">
        Loading...
      </div>
    );
  }

  if (sessionError) return <main className="grid min-h-dvh place-content-center gap-4 bg-neutral-950 p-8 text-white"><h1 className="text-2xl">Connection recovery</h1><p role="alert">{sessionError}</p><button type="button" onClick={retrySession} className="min-h-11 rounded border border-amber-300 px-4 text-amber-200">Retry session</button><button type="button" onClick={logout} className="min-h-11 rounded border border-white/20 px-4">Retry logout</button></main>;
  if (!user || !roleAllowed) return null;

  return children;
};

export default ProtectedRoute;
