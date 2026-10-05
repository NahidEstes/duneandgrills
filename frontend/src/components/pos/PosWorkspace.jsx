"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { fetchPosSession, fetchPosTerminals, lockPosSession, fetchPosCashiers } from "@/src/api/api.js";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import PosTab from "../admin/pos/PosTab.jsx";
import PosTopBar from "./PosTopBar.jsx";
import PosLockScreen from "./PosLockScreen.jsx";
import { usePosCustomerDisplay } from "@/src/hooks/usePosCustomerDisplay.js";
import PosShiftControl from "./PosShiftControl.jsx";

export default function PosWorkspace() {
  const { user, logout } = useAuth();
  const { displayUrl, publishBill } = usePosCustomerDisplay();
  const [actor, setActor] = useState(user);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(true);
  const [everUnlocked, setEverUnlocked] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [clock24, setClock24] = useState(false);
  const [terminals, setTerminals] = useState([]);
  const [terminal, setTerminal] = useState("");
  const [shiftOpen, setShiftOpen] = useState(false);
  const [cashiers, setCashiers] = useState([]);
  const [timeoutMinutes, setTimeoutMinutes] = useState(5);
  const saleActive = useRef(false);
  const lastActivity = useRef(0);
  const warningShown = useRef(false);
  const changeLock = useCallback(async () => {
    setLocked(true);
    try { sessionStorage.setItem("dg_pos_locked:" + user._id, "true"); await lockPosSession(); }
    catch { toast.warning("Screen locked. Reconnect before unlocking."); }
  }, [user._id]);
  const initialize = useCallback(async () => {
    setError("");
    try {
      let session;
      try { session = await fetchPosSession(); }
      catch (failure) { if (failure.response?.status !== 401) throw failure; sessionStorage.removeItem("dg_pos_session"); session = await fetchPosSession(); }
      if (session.token) sessionStorage.setItem("dg_pos_session", session.token);
      const rows = await fetchPosTerminals();
      setTerminals(rows); setActor(session.actor); setTimeoutMinutes(session.autoLockMinutes);
      const preferred = localStorage.getItem("dg_pos_terminal") || "";
      setTerminal(rows.some(row => row.code === preferred) ? preferred : "");
      setClock24(localStorage.getItem("dg_pos_clock24") === "true");
      const mustLock = session.locked || sessionStorage.getItem("dg_pos_locked:" + user._id) === "true";
      setLocked(mustLock); setEverUnlocked(!mustLock); setReady(true);
      if (mustLock && !session.locked) await lockPosSession();
    } catch (failure) { setError(failure.response?.data?.message || "Unable to load POS workspace."); }
  }, [user._id]);
  useEffect(() => { initialize(); }, [initialize]);
  useEffect(() => {
    if (locked || !ready || !timeoutMinutes) return;
    const activity = () => { lastActivity.current = Date.now(); warningShown.current = false; };
    activity();
    for (const name of ["pointerdown", "pointermove", "keydown", "touchstart"]) window.addEventListener(name, activity, { passive: true });
    const timer = setInterval(() => {
      const left = timeoutMinutes * 60_000 - (Date.now() - lastActivity.current);
      if (left <= 0) changeLock();
      else if (left < 30_000 && !warningShown.current) { warningShown.current = true; toast.warning("POS locks in 30 seconds. Touch or type to stay active."); }
    }, 1000);
    return () => { clearInterval(timer); for (const name of ["pointerdown", "pointermove", "keydown", "touchstart"]) window.removeEventListener(name, activity); };
  }, [locked, ready, timeoutMinutes, changeLock]);
  const onSaleState = useCallback(value => { saleActive.current = value; }, []);
  const switchCashier = async () => {
    if (saleActive.current || shiftOpen) return toast.warning("Hold/clear your sale and close your shift before switching cashier.");
    try { setCashiers(await fetchPosCashiers()); setSwitching(true); } catch { toast.error("Unable to load cashiers."); }
  };
  const changeTerminal = value => {
    if (saleActive.current || shiftOpen) return toast.warning("Hold/clear your sale and close your shift before changing terminal.");
    setTerminal(value); localStorage.setItem("dg_pos_terminal", value);
  };
  if (error) return <div className="grid min-h-dvh place-items-center bg-[#070a0c] text-red-300"><div>{error}<button onClick={initialize} className="ml-4 text-dune-amber">Retry</button></div></div>;
  if (!ready) return <div className="grid min-h-dvh place-items-center bg-[#070a0c] text-neutral-400">Loading cashier workspace…</div>;
  return <div className="min-h-dvh bg-[#070a0c] font-body text-neutral-200">
    <div hidden={locked || switching}>
      <PosTopBar user={actor} onLock={changeLock} onSwitch={switchCashier} onLogout={() => { if (window.confirm("Log out? Your unfinished sale remains recoverable.")) { sessionStorage.removeItem("dg_pos_session"); logout(); } }} clock24={clock24} onClockChange={value => { setClock24(value); localStorage.setItem("dg_pos_clock24", String(value)); }} displayUrl={displayUrl}
        terminalControl={<label className="text-xs text-neutral-400"><span className="sr-only">POS terminal</span><DarkSelect value={terminal} onChange={event => changeTerminal(event.target.value)} className="min-h-11 min-w-40 rounded-xl border border-white/10 bg-[#0d1214] px-3 text-sm"><option value="">Select terminal</option>{terminals.map(row => <option key={row._id} value={row.code}>{row.name} · {row.code}</option>)}</DarkSelect></label>}
        shiftControl={terminal && everUnlocked ? <PosShiftControl key={actor._id + ":" + terminal} user={actor} terminal={terminal} locked={locked || switching} onShiftChange={setShiftOpen} /> : null} />
      <main className="p-4 sm:p-6" aria-label="POS / New Sale">{terminal && everUnlocked ? <PosTab key={actor._id + ":" + terminal} user={actor} terminal={terminal} locked={locked || switching} onSaleState={onSaleState} onLock={changeLock} onDisplayChange={publishBill} /> : <div className="rounded-2xl border border-dune-amber/20 p-8 text-center">Select the terminal for this cashier device.</div>}</main>
    </div>
    {(locked || switching) && <PosLockScreen key={switching ? "switch" : "unlock"} user={actor} cashiers={cashiers} switching={switching} onCancel={() => setSwitching(false)} onUnlock={next => { setActor(next); setLocked(false); setEverUnlocked(true); setSwitching(false); sessionStorage.removeItem("dg_pos_locked:" + user._id); lastActivity.current = Date.now(); }} />}
  </div>;
}
