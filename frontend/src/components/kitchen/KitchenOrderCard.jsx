"use client";

import { AlertTriangle, Check, ChefHat, Clock3, PackageCheck, Play, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import OrderItemCustomization from "../OrderItemCustomization.jsx";

const actionByStatus = {
  pending: { next: "confirmed", label: "Accept Order", icon: Check },
  confirmed: { next: "preparing", label: "Start Preparing", icon: Play },
  preparing: { next: "ready", label: "Mark Ready", icon: PackageCheck },
};

const accentByStatus = {
  pending: "border-amber-500/35 shadow-amber-950/20",
  confirmed: "border-sky-500/30 shadow-sky-950/20",
  preparing: "border-orange-500/35 shadow-orange-950/20",
  ready: "border-emerald-500/35 shadow-emerald-950/20",
};

const sourceLabel = (source = "website") => source === "pos"
  ? "POS / Counter"
  : source.charAt(0).toUpperCase() + source.slice(1);

const typeLabel = (type = "") => type
  .replaceAll("-", " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const duration = (seconds) => {
  const safe = Math.max(0, Math.floor(Math.abs(seconds)));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return hours
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};

const timerFor = (order, nowMs) => {
  if (order.status === "pending") {
    return { label: "Waiting", value: duration((nowMs - new Date(order.createdAt).getTime()) / 1000), tone: "text-amber-300" };
  }
  if (order.status === "ready") {
    const start = new Date(order.readyAt || order.createdAt).getTime();
    return { label: "Ready for", value: duration((nowMs - start) / 1000), tone: "text-emerald-300" };
  }
  if (!order.preparationDueAt) {
    const start = new Date(order.preparationStartedAt || order.acceptedAt || order.createdAt).getTime();
    return { label: "Elapsed", value: duration((nowMs - start) / 1000), tone: "text-neutral-300" };
  }
  const seconds = (new Date(order.preparationDueAt).getTime() - nowMs) / 1000;
  if (seconds < 0) return { label: "Overdue", value: duration(seconds), tone: "text-red-300", overdue: true };
  if (seconds <= 300) return { label: "Due soon", value: duration(seconds), tone: "text-amber-300", approaching: true };
  return { label: "Remaining", value: duration(seconds), tone: "text-emerald-300" };
};

export default function KitchenOrderCard({ order, nowMs, defaultPreparationMinutes, updating, onAdvance }) {
  const [estimate, setEstimate] = useState(order.estimatedPreparationMinutes || defaultPreparationMinutes);
  const timer = timerFor(order, nowMs);
  const action = actionByStatus[order.status];
  const ActionIcon = action?.icon;

  useEffect(() => {
    setEstimate(order.estimatedPreparationMinutes || defaultPreparationMinutes);
  }, [defaultPreparationMinutes, order.estimatedPreparationMinutes]);

  return (
    <article className={`overflow-hidden rounded-2xl border bg-gradient-to-b from-[#15191b] to-[#0e1113] shadow-xl ${accentByStatus[order.status]}`}>
      <header className="border-b border-white/[0.08] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-neutral-500">Order</p>
            <h3 className="mt-1 font-display text-2xl tracking-wide text-white">#{order.orderNumber}</h3>
          </div>
          {order.status === "pending" && <span className="animate-pulse rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-amber-300">New Order</span>}
          {timer.overdue && <span className="flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/15 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-red-300"><AlertTriangle className="h-3 w-3" />Overdue</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold">
          <span className="rounded-md bg-white/[0.06] px-2 py-1 text-neutral-300">{sourceLabel(order.source)}</span>
          <span className="rounded-md bg-dune-amber/10 px-2 py-1 text-dune-amberLight">{typeLabel(order.orderType)}</span>
          <span className="rounded-md bg-white/[0.06] px-2 py-1 text-neutral-400">{new Date(order.createdAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </header>

      <div className={`flex items-center justify-between border-b px-4 py-3 ${timer.overdue ? "border-red-500/25 bg-red-500/10" : timer.approaching ? "border-amber-500/20 bg-amber-500/[0.07]" : "border-white/[0.07] bg-black/15"}`}>
        <span className="flex items-center gap-2 text-xs text-neutral-500"><Clock3 className="h-4 w-4" />{timer.label}</span>
        <strong className={`font-mono text-lg ${timer.tone}`}>{timer.value}</strong>
      </div>

      <div className="p-4">
        <div className="space-y-3">
          {order.items.map((item, index) => (
            <div key={`${item.name}-${index}`} className="border-b border-white/[0.06] pb-3 last:border-0 last:pb-0">
              <div className="flex gap-3 text-sm">
                <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-dune-amber/15 font-bold text-dune-amber">{item.quantity}</span>
                <p className="pt-1 font-semibold leading-5 text-white">{item.name}</p>
              </div>
              {item.comboItems?.length > 0 && (
                <ul className="ml-10 mt-1.5 space-y-1 text-[0.7rem] text-neutral-500">
                  {item.comboItems.map((part, partIndex) => <li key={`${part.name}-${partIndex}`}>• {part.quantity}× {part.name}</li>)}
                </ul>
              )}
              <OrderItemCustomization item={item} className="ml-10 text-amber-100/65" />
            </div>
          ))}
        </div>

        {order.notes && <div className="mt-4 rounded-xl border border-dune-amber/20 bg-dune-amber/[0.06] p-3"><p className="text-[0.62rem] font-semibold uppercase tracking-wider text-dune-amber">Kitchen notes</p><p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-neutral-200">{order.notes}</p></div>}
        {order.customerName && <p className="mt-3 flex items-center gap-2 text-xs text-neutral-500"><UserRound className="h-3.5 w-3.5" />{order.customerName}</p>}

        {order.status === "pending" && (
          <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-neutral-400">
            Prep estimate
            <span className="flex items-center gap-2"><input type="number" min="1" max="240" value={estimate} onChange={(event) => setEstimate(event.target.value)} className="h-9 w-16 rounded-lg border border-white/10 bg-[#090b0c] px-2 text-center text-sm text-white outline-none focus:border-dune-amber" /><span>min</span></span>
          </label>
        )}

        {action ? (
          <button type="button" disabled={updating} onClick={() => onAdvance(order, action.next, order.status === "pending" ? { estimatedPreparationMinutes: Number(estimate) } : {})} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-dune-amberDeep to-dune-amber px-4 text-sm font-bold text-black shadow-lg shadow-orange-950/30 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-50">
            {updating ? <ChefHat className="h-5 w-5 animate-pulse" /> : <ActionIcon className="h-5 w-5" />}
            {updating ? "Updating…" : action.label}
          </button>
        ) : <div className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-sm font-semibold text-emerald-300"><PackageCheck className="h-5 w-5" />Awaiting handover</div>}
      </div>
    </article>
  );
}
