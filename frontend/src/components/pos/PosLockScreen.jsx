"use client";

import { useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { loginUser } from "@/src/api/api.js";

// A cashier screen lock, not a replacement for server-side authorization.
// Verify using the existing login API without migrating or resetting any cart.
export default function PosLockScreen({ user, onUnlock }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  const unlock = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await loginUser({ email: user.email, password });
      if (result.user?._id !== user._id || !["admin", "manager"].includes(result.user?.role)) {
        throw new Error("Cashier identity does not match.");
      }
      localStorage.setItem("dg_token", result.token);
      onUnlock();
    } catch {
      setError("Unable to unlock. Check your password and connection.");
      setPassword("");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-[#070a0c] px-4 text-neutral-200">
      <form onSubmit={unlock} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101618] p-6 shadow-2xl">
        <LockKeyhole className="mb-4 h-8 w-8 text-dune-amber" />
        <h1 className="text-xl font-semibold text-white">POS locked</h1>
        <p className="mt-2 text-sm text-neutral-400">{user.name}, enter your account password to resume.</p>
        <p className="mt-2 text-xs text-neutral-500">Your current sale stays open while this page remains loaded.</p>
        <label htmlFor="pos-unlock-password" className="mt-5 block text-sm">Password</label>
        <input id="pos-unlock-password" type="password" autoComplete="current-password" autoFocus required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-white outline-none focus:border-dune-amber" />
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="mt-5 min-h-11 w-full rounded-xl bg-dune-amber font-semibold text-black disabled:opacity-50">{busy ? "Unlocking…" : "Unlock POS"}</button>
      </form>
    </div>
  );
}
