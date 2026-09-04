"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Flame, Monitor, ReceiptText, UtensilsCrossed, WifiOff } from "lucide-react";
import { formatAdminCurrency } from "../admin/adminUi.js";
import { isDisplaySession, startDisplayReceiver } from "../../utils/customerDisplaySync.js";

const connectionLabels = {
  connecting: "Connecting to cashier…",
  disconnected: "POS disconnected — reconnecting…",
  unavailable: "Open Customer Display from the cashier POS window.",
  unsupported: "Live display is unavailable in this browser.",
};

export default function CustomerDisplay() {
  const session = useSearchParams().get("session");
  const [state, setState] = useState({ connection: "connecting", bill: null });

  useEffect(() => {
    if (!isDisplaySession(session)) {
      setState({ connection: "unavailable", bill: null });
      return undefined;
    }
    let receiver;
    try { receiver = startDisplayReceiver(session, setState); } catch {
      setState({ connection: "unsupported", bill: null });
      return undefined;
    }
    const resync = () => receiver.request();
    window.addEventListener("focus", resync);
    window.addEventListener("pageshow", resync);
    document.addEventListener("visibilitychange", resync);
    return () => {
      window.removeEventListener("focus", resync);
      window.removeEventListener("pageshow", resync);
      document.removeEventListener("visibilitychange", resync);
      receiver.close();
    };
  }, [session]);

  const bill = state.connection === "connected" ? state.bill : null;
  return (
    <div className="flex min-h-dvh flex-col bg-[#060807] p-4 font-body text-white sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-dune-amber/60 pb-6">
        <div className="flex items-center gap-4"><Flame className="h-12 w-12 shrink-0 fill-dune-amber text-dune-amber sm:h-16 sm:w-16" /><div><h1 className="font-display text-4xl tracking-wide sm:text-6xl">DUNE &amp; GRILLS</h1><p className="text-xs font-semibold tracking-[0.2em] text-dune-amber sm:text-base">GRILLED TO PERFECTION</p></div></div>
        <div className="flex items-center gap-3 rounded-xl border border-dune-amber/70 px-5 py-3 text-sm font-semibold text-dune-amber sm:text-xl"><Monitor className="h-6 w-6" />CUSTOMER DISPLAY</div>
      </header>

      {state.connection !== "connected" && <p role="status" className="mt-5 flex items-center gap-2 text-sm text-amber-300"><WifiOff className="h-5 w-5" />{connectionLabels[state.connection]}</p>}

      {bill ? (
        <main className="my-6 grid flex-1 gap-5 lg:grid-cols-[minmax(0,1.8fr)_minmax(290px,1fr)]">
          <section className="flex flex-col rounded-3xl border border-white/15 bg-gradient-to-br from-white/[0.05] to-transparent p-5 sm:p-8">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><h2 className="flex items-center gap-3 text-xl font-semibold sm:text-3xl"><ReceiptText className="h-9 w-9 text-dune-amber" />ORDER SUMMARY</h2><div className="flex flex-wrap gap-2 text-xs font-semibold uppercase text-dune-amber sm:text-sm">{bill.orderType && <span className="rounded-xl bg-dune-amber/10 px-3 py-2">{bill.orderType === "dine-in" ? "Dine-in" : "Takeaway"}</span>}{bill.status && <span className="rounded-xl bg-dune-amber/10 px-3 py-2">{bill.status === "processing" ? "Processing sale…" : "Awaiting payment"}</span>}</div></div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base sm:text-xl">
                <thead className="border-y border-white/15 text-xs uppercase text-dune-amber sm:text-sm"><tr><th className="py-4 pr-3">Item</th><th className="px-2 py-4 text-center">Qty</th><th className="px-2 py-4 text-right">Unit price</th><th className="py-4 pl-3 text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-white/10">{bill.items.map((item, index) => <tr key={index}><td className="min-w-32 py-6 pr-3 font-medium [overflow-wrap:anywhere]">{item.name}</td><td className="px-2 py-6 text-center font-semibold">×{item.quantity}</td><td className="whitespace-nowrap px-2 py-6 text-right tabular-nums text-neutral-300">{formatAdminCurrency(item.unitPrice)}</td><td className="whitespace-nowrap py-6 pl-3 text-right font-semibold tabular-nums text-dune-amber">{formatAdminCurrency(item.lineTotal)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="mt-auto border-t border-dashed border-white/15 pt-6"><p className="text-lg text-dune-amber">Please review your order.</p><p className="mt-2 text-neutral-400">Thanks for dining with Dune &amp; Grills!</p></div>
          </section>
          <aside className="flex flex-col rounded-3xl border border-white/15 bg-gradient-to-b from-white/[0.04] to-dune-amber/[0.07] p-6 sm:p-8">
            <div className="flex justify-between gap-4 border-b border-dashed border-white/20 py-6 text-xl"><span>Subtotal</span><span className="tabular-nums">{formatAdminCurrency(bill.subtotal)}</span></div>
            {bill.discount > 0 && <div className="flex justify-between gap-4 border-b border-white/20 py-6 text-xl text-dune-amber"><span>Discount</span><span className="tabular-nums">−{formatAdminCurrency(bill.discount)}</span></div>}
            <div className="py-10"><h2 className="text-2xl font-semibold text-dune-amber">YOUR TOTAL</h2><p className="mt-5 break-words font-display text-[clamp(2.5rem,5.5vw,6rem)] leading-tight tabular-nums">{formatAdminCurrency(bill.total)}</p></div>
            <div className="mt-auto border-t border-white/10 pt-8 text-center text-neutral-400"><UtensilsCrossed className="mx-auto mb-4 h-12 w-12 text-dune-amber/60" /><p>Sit back and relax,<br />we’ll take care of the rest.</p></div>
          </aside>
        </main>
      ) : (
        <main className="my-6 grid min-h-[55vh] flex-1 place-items-center rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-dune-amber/[0.04] p-8 text-center"><div><UtensilsCrossed className="mx-auto mb-6 h-20 w-20 text-dune-amber" /><h2 className="font-display text-4xl tracking-wide sm:text-6xl">WELCOME TO DUNE &amp; GRILLS</h2><p className="mt-5 text-xl text-neutral-300">Your order will appear here.</p><p className="mt-3 text-neutral-500">Freshly prepared. Made for you.</p></div></main>
      )}
      <footer className="border-t border-white/10 pt-5 text-xs font-semibold tracking-widest text-dune-amber sm:text-sm">FRESH INGREDIENTS. BOLD FLAVORS. EVERY TIME.</footer>
    </div>
  );
}
