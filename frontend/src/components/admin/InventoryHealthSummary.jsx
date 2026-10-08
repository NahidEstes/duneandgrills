"use client";

import Link from "next/link";
import { dashboardNumber } from "./dashboardFreshness.js";
import { AlertTriangle, ArrowRight, CalendarClock, ListChecks, PackageX, ReceiptText } from "lucide-react";

export default function InventoryHealthSummary({ summary, panelClass = "" }) {
  if (!summary?.destinations) return <section aria-label="Inventory Health" className={`${panelClass} p-4 text-sm text-neutral-400`}>Inventory Health unavailable.</section>;
  const cards = [
    ["lowStock", AlertTriangle, "Low Stock", "Items · positive saleable stock ≤ reorder level", "text-amber-400"],
    ["outOfStock", PackageX, "Out of Stock", "Items · zero saleable stock", "text-red-400"],
    ["expiringItems", CalendarClock, "Expiring Items", `Items · today through +${dashboardNumber(summary.expiryAlertDays)} Riyadh days`, "text-violet-400"],
    ["pendingPurchaseOrders", ReceiptText, "Pending Purchase Orders", "Orders · ordered or partially received", "text-sky-400"],
    ["openPurchasingActions", ListChecks, "Purchasing Actions", "Actions · open or acknowledged", "text-orange-400"],
  ];
  const warnings = [
    ["expiredItems", "Expired"], ["quarantinedItems", "Quarantined"], ["damagedItems", "Damaged"],
    ["unknownExpiryItems", "Missing required expiry"], ["unallocatedItems", "Unallocated physical stock"],
    ["unknownQualityItems", "Unclassified batch quality"],
  ];
  return <section aria-label="Inventory Health">
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-white">Inventory Health</h2>
      <Link href="/inventory" className="text-xs font-semibold text-dune-amber hover:text-dune-amberLight">Open Inventory <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></Link>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map(([key, Icon, label, note, tone]) => <Link key={key} href={summary.destinations[key]} className={`${panelClass} flex items-center gap-3 p-4 transition hover:border-dune-amber/30 hover:bg-white/[0.04]`}>
        <span className={`rounded-xl bg-white/[0.04] p-2.5 ${tone}`}><Icon className="h-5 w-5" /></span>
        <span className="min-w-0"><span className="block text-xs text-neutral-400">{label}</span><strong className="mt-0.5 block text-xl text-white">{dashboardNumber(summary[key])}</strong><span className="block text-[0.65rem] leading-4 text-neutral-500">{note}</span></span>
      </Link>)}
    </div>
    <div className={`${panelClass} mt-3 p-4`}>
      <Link href={summary.destinations.blockedItems} className="inline-flex items-center gap-2 text-sm font-semibold text-amber-400"><AlertTriangle className="h-4 w-4" />Expired / Blocked Stock · {dashboardNumber(summary.blockedItems)} items <ArrowRight className="h-3.5 w-3.5" /></Link>
      <div className="mt-2 flex flex-wrap gap-2">{warnings.map(([key, label]) => <Link key={key} href={summary.destinations[key]} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-dune-amber/40">{label}: {dashboardNumber(summary[key])} items</Link>)}</div>
      <p className="mt-2 text-[0.65rem] leading-4 text-neutral-500">Stock metrics count unique active items, not batches or mixed-unit quantities. Warning categories can overlap; the combined warning counts each item once. Expiring includes remaining physical stock, even when blocked. Open a stock list for physical versus saleable quantities.</p>
    </div>
  </section>;
}
