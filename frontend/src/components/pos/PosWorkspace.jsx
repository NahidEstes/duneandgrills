"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/src/context/AuthContext.jsx";
import PosTab from "../admin/pos/PosTab.jsx";
import PosTopBar from "./PosTopBar.jsx";
import PosLockScreen from "./PosLockScreen.jsx";
import { usePosCustomerDisplay } from "@/src/hooks/usePosCustomerDisplay.js";

export default function PosWorkspace() {
  const { user, logout } = useAuth();
  const { displayUrl, publishBill } = usePosCustomerDisplay();
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(true);
  const [clock24, setClock24] = useState(false);
  const lockKey = `dg_pos_locked:${user._id}`;

  useEffect(() => {
    try {
      setLocked(sessionStorage.getItem(lockKey) === "true");
      setClock24(localStorage.getItem("dg_pos_clock24") === "true");
    } catch {
      // If browser storage is unavailable, fail closed; password unlock still works.
      setLocked(true);
    }
    setReady(true);
  }, [lockKey]);

  const changeLock = (value) => {
    try { sessionStorage.setItem(lockKey, String(value)); } catch { /* In-memory lock remains available. */ }
    setLocked(value);
  };
  const changeClock = (value) => {
    setClock24(value);
    try { localStorage.setItem("dg_pos_clock24", String(value)); } catch { /* Preference lasts for this visit. */ }
  };
  const handleLogout = () => {
    if (!window.confirm("Log out of POS? Any unfinished sale on this page will be discarded.")) return;
    changeLock(true);
    logout();
  };

  if (!ready) return <div className="grid min-h-dvh place-items-center bg-[#070a0c] text-neutral-400">Loading cashier workspace…</div>;

  return (
    <div className="min-h-dvh bg-[#070a0c] font-body text-neutral-200">
      {/* Keep the shared POS mounted so locking never clears its sale state. */}
      <div hidden={locked}>
        <PosTopBar user={user} onLock={() => changeLock(true)} onLogout={handleLogout} clock24={clock24} onClockChange={changeClock} displayUrl={displayUrl} />
        <main className="p-4 sm:p-6" aria-label="POS / New Sale">
          <h1 className="sr-only">POS / New Sale</h1>
          <PosTab onDisplayChange={publishBill} />
        </main>
      </div>
      {locked && <PosLockScreen user={user} onUnlock={() => changeLock(false)} />}
    </div>
  );
}
