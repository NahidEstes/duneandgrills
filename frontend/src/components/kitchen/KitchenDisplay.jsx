"use client";

import DarkSelect from "../ui/DarkSelect.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { BellRing, ChefHat, Flame, LogOut, RefreshCw, Search, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import KitchenOrderCard from "./KitchenOrderCard.jsx";
import { KITCHEN_COLUMNS, KITCHEN_POLL_INTERVAL_MS } from "./kitchenConfig.js";
import useKitchenAlerts from "./useKitchenAlerts.js";
import useKitchenQueue from "./useKitchenQueue.js";

const sourceOptions = ["all", "website", "pos", "phone", "jahez", "hungerstation"];
const typeOptions = ["all", "dine-in", "takeaway", "pickup", "delivery"];
const selectClass = "h-11 min-w-40 rounded-xl border border-white/10 bg-[#111517] px-3 text-sm text-neutral-300 outline-none focus:border-dune-amber/60";

const label = (value) => value === "all"
  ? "All"
  : value === "pos"
    ? "POS / Counter"
    : value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const connectionPresentation = {
  connecting: { label: "Connecting", color: "text-neutral-400", icon: RefreshCw },
  connected: { label: "Live", color: "text-emerald-400", icon: Wifi },
  reconnecting: { label: "Reconnecting", color: "text-amber-300", icon: RefreshCw },
  disconnected: { label: "Disconnected", color: "text-red-300", icon: WifiOff },
};

const columnStyle = {
  amber: "border-amber-500/20 bg-amber-500/[0.035] text-amber-300",
  sky: "border-sky-500/20 bg-sky-500/[0.035] text-sky-300",
  orange: "border-orange-500/20 bg-orange-500/[0.035] text-orange-300",
  emerald: "border-emerald-500/20 bg-emerald-500/[0.035] text-emerald-300",
};

export default function KitchenDisplay() {
  const { user, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [source, setSource] = useState("all");
  const [orderType, setOrderType] = useState("all");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const filters = useMemo(() => ({ search: debouncedSearch, source, orderType }), [debouncedSearch, orderType, source]);
  const queue = useKitchenQueue(filters);
  const alerts = useKitchenAlerts(queue.orders);
  const connection = connectionPresentation[queue.connection] || connectionPresentation.connecting;
  const ConnectionIcon = connection.icon;
  const nowMs = (tick || queue.lastUpdatedAt || 0) + queue.clockOffsetMs;

  const grouped = useMemo(() => Object.fromEntries(KITCHEN_COLUMNS.map(({ status }) => [
    status,
    queue.orders.filter((order) => order.status === status),
  ])), [queue.orders]);

  const advance = async (order, status, options) => {
    try {
      await queue.transition(order._id, status, options);
      toast.success(`Order #${order.orderNumber} marked ${label(status)}.`);
    } catch (error) {
      toast.error(error.response?.data?.message || "The kitchen status could not be updated.");
      queue.refresh();
    }
  };

  const handleLogout = () => {
    if (window.confirm("Log out of the Kitchen Display?")) logout();
  };

  return (
    <div className="min-h-dvh bg-[#070a0c] font-body text-neutral-200">
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#080b0d]/95 backdrop-blur-xl">
        <div className="flex min-h-20 flex-wrap items-center gap-3 px-4 py-3 sm:px-6 xl:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-dune-amber text-black"><Flame className="h-6 w-6 fill-current" /></span>
            <span><span className="block font-display text-xl tracking-wider text-white">DUNE <span className="text-dune-amber">&amp;</span> GRILLS</span><span className="block text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-dune-amber">Kitchen Display</span></span>
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <span className={`inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs ${connection.color}`} title={queue.error || undefined}><ConnectionIcon className={`h-4 w-4 ${queue.connection === "connecting" || queue.connection === "reconnecting" ? "animate-spin" : ""}`} />{connection.label}</span>
            <button type="button" onClick={queue.refresh} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-neutral-400 hover:border-dune-amber/40 hover:text-dune-amber" aria-label="Refresh kitchen orders"><RefreshCw className="h-4 w-4" /></button>
            <button type="button" onClick={alerts.soundEnabled ? alerts.muteSound : async () => { if (!await alerts.enableSound()) toast.error("The browser blocked kitchen sound. Try again after interacting with the page."); }} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${alerts.soundEnabled ? "border-dune-amber/40 bg-dune-amber/10 text-dune-amber" : "border-white/10 text-neutral-400"}`}>{alerts.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}{alerts.soundEnabled ? "Sound On" : "Enable Sound"}</button>
            <div className="hidden border-l border-white/10 pl-3 text-right md:block"><p className="text-xs font-semibold text-white">{user?.name}</p><p className="text-[0.62rem] capitalize text-neutral-500">{user?.role}</p></div>
            <button type="button" onClick={handleLogout} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-neutral-500 hover:border-red-500/30 hover:text-red-300" aria-label="Log out"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>

        {alerts.unacknowledgedCount > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-3 border-t border-amber-400/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
            <BellRing className="h-4 w-4 animate-pulse" />
            <strong>{alerts.unacknowledgedCount} new kitchen {alerts.unacknowledgedCount === 1 ? "order" : "orders"}</strong>
            <button type="button" onClick={alerts.acknowledge} className="rounded-lg border border-amber-300/30 px-3 py-1 font-semibold hover:bg-amber-300/10">Acknowledge alert</button>
          </div>
        )}
      </header>

      <main className="p-4 sm:p-6 xl:p-8">
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2"><ChefHat className="h-6 w-6 text-dune-amber" /><h1 className="font-display text-3xl tracking-wide text-white">Kitchen Board</h1></div>
            <p className="mt-1 text-xs text-neutral-500">Updates every {KITCHEN_POLL_INTERVAL_MS / 1000} seconds · Ready orders remain for {queue.config.readyRetentionMinutes} minutes</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order number…" className="h-11 w-full rounded-xl border border-white/10 bg-[#111517] pl-10 pr-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60" /></label>
            <DarkSelect value={source} onChange={(event) => setSource(event.target.value)} className={selectClass}>{sourceOptions.map((value) => <option key={value} value={value}>{value === "all" ? "All sources" : label(value)}</option>)}</DarkSelect>
            <DarkSelect value={orderType} onChange={(event) => setOrderType(event.target.value)} className={selectClass}>{typeOptions.map((value) => <option key={value} value={value}>{value === "all" ? "All order types" : label(value)}</option>)}</DarkSelect>
          </div>
        </div>

        {queue.connection === "disconnected" && <div role="alert" className="mb-5 flex items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200"><WifiOff className="h-5 w-5" /><span><strong>Kitchen connection lost.</strong> Showing the last successful queue while automatic reconnection continues.</span></div>}

        <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {KITCHEN_COLUMNS.map((column) => (
            <section key={column.status} className={`min-h-64 rounded-2xl border p-3 ${columnStyle[column.accent]}`} aria-labelledby={`kitchen-${column.status}`}>
              <header className="mb-3 flex items-center justify-between px-1 py-1">
                <h2 id={`kitchen-${column.status}`} className="text-sm font-bold uppercase tracking-[0.16em]">{column.label}</h2>
                <span className="grid h-7 min-w-7 place-items-center rounded-full bg-black/35 px-2 text-xs font-bold text-white">{grouped[column.status].length}</span>
              </header>
              <div className="space-y-3">
                {grouped[column.status].map((order) => <KitchenOrderCard key={order._id} order={order} nowMs={nowMs} defaultPreparationMinutes={queue.config.defaultPreparationMinutes} updating={queue.updatingIds.has(String(order._id))} onAdvance={advance} />)}
                {!grouped[column.status].length && <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-white/10 bg-black/10 px-4 text-center text-xs text-neutral-600">No {column.label.toLowerCase()} orders</div>}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-4 text-[0.65rem] text-neutral-600">
          <span>Server timestamps drive kitchen timers and status validation.</span>
          <span>{queue.lastUpdatedAt ? `Last synchronized ${new Date(queue.lastUpdatedAt).toLocaleTimeString("en-SA")}` : "Waiting for first synchronization…"}</span>
        </footer>
      </main>
    </div>
  );
}
