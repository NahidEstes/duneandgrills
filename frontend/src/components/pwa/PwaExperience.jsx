"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { appKind } from "../../pwa/config.js";
import { updateBlockedForWindow } from "../../pwa/network.js";

export default function PwaExperience() {
  const pathname = usePathname();
  const kind = appKind(pathname);
  const staff = kind !== "customer";
  const [online, setOnline] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [stale, setStale] = useState(false);
  const [install, setInstall] = useState(null);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIOS] = useState(false);
  const [waiting, setWaiting] = useState(null);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState("unsupported");
  const [installationUnavailable, setInstallationUnavailable] = useState(false);
  const applying = useRef(false);
  useEffect(() => {
    let disposed = false; let registration; let checkTimer;
    let controlled = Boolean(navigator.serviceWorker?.controller);
    let warmed = false;
    const warmMenu = () => { if (!warmed && kind === "customer" && navigator.onLine && navigator.serviceWorker?.controller) { warmed = true; fetch("/api/menu", { credentials: "omit", cache: "no-store" }).catch(() => {}); } };
    const offline = () => { setOnline(false); setReconnecting(false); };
    const connected = () => { setOnline(true); setReconnecting(true); };
    const network = event => {
      if (event.detail.unavailable) setReconnecting(true);
      if (event.detail.recovered) { setReconnecting(false); setOnline(navigator.onLine); }
      if (event.detail.stale !== undefined) setStale(event.detail.stale);
    };
    const prompt = event => { event.preventDefault(); setInstall(event); };
    const installed = () => { setInstall(null); setStandalone(true); };
    const changed = () => {
      if (applying.current && !updateBlockedForWindow(window)) window.location.reload();
      else if (controlled || applying.current) {
        setRefreshNeeded(true);
        if (applying.current) setMessage("The update is ready. Finish or reconcile the current operation before reloading.");
        applying.current = false;
      }
      controlled = true; warmMenu();
    };
    const workerMessage = event => { if (event.data?.type === "STALE_MENU") setStale(true); if (event.data?.type === "FRESH_MENU") setStale(false); };
    setOnline(navigator.onLine);
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true);
    setIOS(/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    setPermission("Notification" in window ? Notification.permission : "unsupported");
    window.addEventListener("offline", offline); window.addEventListener("online", connected);
    window.addEventListener("dg-network", network); window.addEventListener("beforeinstallprompt", prompt); window.addEventListener("appinstalled", installed);
    const check = () => { if (navigator.onLine && registration) registration.update().catch(() => {}); };
    window.addEventListener("focus", check);
    if ("serviceWorker" in navigator && (window.isSecureContext || location.hostname === "localhost")) {
      navigator.serviceWorker.addEventListener("controllerchange", changed);
      navigator.serviceWorker.addEventListener("message", workerMessage);
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(value => {
        if (disposed) return;
        registration = value;
        warmMenu();
        if (value.waiting) setWaiting(value.waiting);
        value.addEventListener("updatefound", () => {
          const worker = value.installing;
          worker?.addEventListener("statechange", () => { if (!disposed && worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(value.waiting || worker); });
        });
        checkTimer = window.setInterval(check, 60 * 60 * 1000);
      }).catch(() => { if (!disposed) setInstallationUnavailable(true); });
    }
    return () => {
      disposed = true; window.clearInterval(checkTimer);
      window.removeEventListener("offline", offline); window.removeEventListener("online", connected); window.removeEventListener("dg-network", network);
      window.removeEventListener("beforeinstallprompt", prompt); window.removeEventListener("appinstalled", installed); window.removeEventListener("focus", check);
      navigator.serviceWorker?.removeEventListener("controllerchange", changed); navigator.serviceWorker?.removeEventListener("message", workerMessage);
    };
  }, [kind]);
  const applyUpdate = () => {
    if (!online) return setMessage("Reconnect before applying an update.");
    if (updateBlockedForWindow(window)) return setMessage("Finish or reconcile the saved order/payment before updating. Nothing will be resent automatically.");
    if (!window.confirm("Apply update and reload? Save or hold any unfinished POS sale and finish editing before continuing.")) return;
    applying.current = true;
    if (refreshNeeded) return window.location.reload();
    waiting?.postMessage({ type: "ACTIVATE_UPDATE" });
  };
  const installApp = async () => {
    if (install) { await install.prompt(); await install.userChoice; setInstall(null); }
    else setMessage(ios ? "In Safari, use Share → Add to Home Screen. Install POS from /pos and Kitchen from /kitchen." : "Use your browser's Install app / Add to Home Screen command. Open /pos or /kitchen to install that workspace.");
  };
  const notify = async () => {
    if (permission === "denied") return setMessage("Notifications are blocked. Change this site's permission in browser settings.");
    if (!("Notification" in window)) return;
    try { setPermission(await Notification.requestPermission()); }
    catch { setMessage("This browser does not support notification permission here."); }
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setMessage("Install the app for standalone use. This browser does not support fullscreen.");
    } catch { setMessage("Fullscreen is unavailable. Use the browser's fullscreen command."); }
  };
  // Keep the second monitor limited to the public bill and connectivity indicators.
  const display = pathname === "/pos/customer-display";
  return <aside aria-label="App connection and installation" className="print:hidden">
    {(!online || reconnecting || stale) && <div role="status" aria-live="polite" className="sticky top-0 z-[80] border-b border-amber-500/40 bg-amber-950 px-4 py-3 text-center text-sm text-amber-100">
      {!online ? "Offline. Reconnect to order, pay or change status. No operations are queued." : reconnecting ? "Reconnecting — retained data may be outdated. Retry after the connection recovers." : "Showing a saved menu. Prices and availability are checked again online at checkout."}
    </div>}
    {(waiting || refreshNeeded) && <div role="status" className="border-b border-amber-400/30 bg-neutral-900 px-4 py-3 text-center text-sm text-white">App update available. <button type="button" onClick={applyUpdate} className="min-h-11 rounded border border-amber-400 px-4 text-amber-200">Apply update</button></div>}
    {!display && <div className="fixed bottom-3 left-3 z-[70] max-w-[calc(100vw-1.5rem)] text-sm text-white">
      <button type="button" aria-expanded={open} aria-controls="pwa-options" onClick={() => setOpen(value => !value)} className="min-h-11 rounded-xl border border-white/20 bg-neutral-950 px-4 shadow-xl focus-visible:outline focus-visible:outline-amber-300">App options</button>
      {open && <div id="pwa-options" className="mt-2 max-w-sm space-y-2 rounded-xl border border-white/20 bg-neutral-950 p-3 shadow-xl">
        {installationUnavailable && <p role="status" className="text-xs text-amber-200">Offline installation support is unavailable in this browser. Ordering still works online.</p>}
        {!standalone && <button type="button" onClick={installApp} className="min-h-11 w-full rounded bg-amber-400 px-4 text-left text-black">Install {staff ? kind === "pos" ? "POS" : "Kitchen" : "Dune & Grills"}</button>}
        {staff && <button type="button" onClick={fullscreen} className="min-h-11 w-full rounded border border-white/20 px-4 text-left">Toggle fullscreen</button>}
        {permission !== "unsupported" && <button type="button" onClick={notify} disabled={permission === "granted"} className="min-h-11 w-full rounded border border-white/20 px-4 text-left disabled:opacity-60">{permission === "granted" ? "Notifications allowed" : "Allow notifications"}</button>}
        <p className="text-xs text-neutral-300">Alerts work while the Kitchen/Admin app is open. Background push requires a separately configured push service.</p>
      </div>}
    </div>}
    {message && <div role="alert" className="fixed bottom-16 left-3 z-[90] max-w-sm rounded-xl border border-amber-400/40 bg-neutral-950 p-4 text-sm text-white"><p>{message}</p><button type="button" onClick={() => setMessage("")} className="mt-2 min-h-11 px-3 text-amber-300">Dismiss</button></div>}
  </aside>;
}
