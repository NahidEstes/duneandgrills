"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { dashboardMoney, dashboardNumber, successfulUpdateLabel } from "./dashboardFreshness.js";
import { statusStyles } from "./adminUi.js";
import {
  ORDER_STATUS_LABELS, customerDisplayName, orderAgeLabel, orderDateLabel,
  orderItemQuantity, orderPaymentLabel, orderPreparationLabel, orderSourceLabel,
} from "../../utils/adminOrders.js";

export default function RecentOrdersPanel({ resource, status = "all", onStatusChange, onRefresh, viewAllHref = "/admin?tab=orders", orderHref = id => `/admin?tab=orders&order=${id}` }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 30000);
    return () => clearInterval(timer);
  }, []);
  const orders = resource.data?.data;
  const update = successfulUpdateLabel(resource.lastSuccessAt, now);
  const stale = resource.status === "stale" || (Array.isArray(orders) && (resource.error || resource.offline));
  return (
    <section aria-label="Recent Orders" aria-busy={resource.status === "loading" || resource.refreshing} className="overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] to-white/[0.018] shadow-[0_18px_50px_-35px_rgba(0,0,0,0.9)]">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-white/[0.07] px-4 sm:px-5">
        <h2 className="text-sm font-semibold text-white sm:text-base">Recent Orders</h2>
        <Link href={viewAllHref} scroll={false} className="inline-flex shrink-0 items-center gap-1 text-xs text-dune-amber focus-visible:outline focus-visible:outline-2">View All Orders <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
      <div role="group" aria-label="Recent order status" className="flex gap-1 overflow-x-auto border-b border-white/[0.07] px-3 pt-2">
        {["all", ...Object.keys(ORDER_STATUS_LABELS)].map(value => (
          <button key={value} type="button" aria-pressed={status === value} onClick={() => onStatusChange?.(value)} className={`shrink-0 border-b-2 px-2.5 py-2 text-xs focus-visible:outline focus-visible:outline-2 ${status === value ? "border-dune-amber text-dune-amber" : "border-transparent text-neutral-400 hover:text-white"}`}>{value === "all" ? "All" : ORDER_STATUS_LABELS[value]}</button>
        ))}
      </div>
      <div className="space-y-1 border-b border-white/[0.06] px-4 py-2 text-[0.7rem] text-neutral-400">
        <p>Latest 7 matching orders{Number.isFinite(resource.data?.pagination?.total) ? ` · ${resource.data.pagination.total} matching` : ""}{resource.data?.pagination?.hasMore ? " · More in Order Management" : ""}</p>
        {update && <p>Last successful update: <time dateTime={update.iso} title={update.exact} aria-label={`Last successful update: ${update.exact}`}>{update.relative}</time></p>}
        {resource.refreshing && <p role="status">Refreshing recent orders…</p>}
        {stale && <p role="alert" className="text-amber-300">Recent orders may be outdated. {resource.offline ? "Browser offline." : "Refresh failed."} <button type="button" onClick={onRefresh} className="underline">Retry recent orders</button></p>}
      </div>
      {resource.status === "loading" && !orders ? <p role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-neutral-400"><RefreshCw className="h-4 w-4 animate-spin" />Loading recent orders…</p>
        : !Array.isArray(orders) ? <div role="alert" className="p-8 text-center text-sm text-neutral-400">Recent orders unavailable. {resource.offline ? "Browser offline." : resource.error || "Please retry."} <button type="button" onClick={onRefresh} className="text-dune-amber underline">Retry recent orders</button></div>
        : orders.length === 0 ? <p role="status" className="p-8 text-center text-sm text-neutral-400">No recent orders match this status.</p>
        : <ul className="divide-y divide-white/[0.06]">
          {orders.map(order => {
            const prep = orderPreparationLabel(order, now);
            return <li key={order._id} className="space-y-2 px-4 py-3 hover:bg-white/[0.025]">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="min-w-0 flex-1">
                  <Link href={orderHref(order._id)} scroll={false} aria-label={`Open order ${order.orderNumber || "details"}`} className="break-all text-sm font-semibold text-white underline-offset-4 hover:text-dune-amber hover:underline focus-visible:outline focus-visible:outline-2">{order.orderNumber || "Order number unavailable"}</Link>
                  <p className="mt-0.5 break-words text-xs text-neutral-300">{customerDisplayName(order)} · {dashboardNumber(orderItemQuantity(order))} items</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-white">{dashboardMoney(order.totalAmount)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[0.65rem]">
                <span className="rounded-md border border-white/10 px-2 py-1 text-neutral-300">{orderSourceLabel(order.source)}</span>
                <span aria-label={`Order status: ${ORDER_STATUS_LABELS[order.status] || "Unavailable"}`} className={`rounded-md border px-2 py-1 ${statusStyles[order.status] || statusStyles.inactive}`}>{ORDER_STATUS_LABELS[order.status] || "Status unavailable"}</span>
                <span aria-label={`Payment: ${orderPaymentLabel(order)}`} className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-neutral-300">{orderPaymentLabel(order)}</span>
              </div>
              <div className="space-y-0.5 text-[0.7rem] text-neutral-500">
                <p><span title={orderDateLabel(order.createdAt)}>Entered: {orderDateLabel(order.createdAt)}</span> · {orderAgeLabel(order.createdAt)}</p>
                {order.manualEntry && <p>Order occurred: {orderDateLabel(order.orderOccurredAt)}</p>}
                {prep && <p title={orderDateLabel(order.preparationDueAt)} className={prep.overdue ? "text-red-300" : "text-neutral-400"}>{prep.text}</p>}
              </div>
            </li>;
          })}
        </ul>}
    </section>
  );
}
