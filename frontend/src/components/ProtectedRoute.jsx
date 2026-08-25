"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext.jsx";

// roles: e.g. ["admin", "manager"]. Leave empty to just require login.
const ProtectedRoute = ({ children, roles = [] }) => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const roleAllowed = roles.length === 0 || (user && roles.includes(user.role));

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!roleAllowed) router.replace("/");
  }, [loading, roleAllowed, router, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-neutral-400">
        Loading...
      </div>
    );
  }

  if (!user || !roleAllowed) return null;

  return children;
};

export default ProtectedRoute;
