"use client";
import { withLocale } from "../i18n/LocaleProvider.jsx";
import { t, catalogText, formatDate } from "../i18n/core.js";


import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { trackGuestOrder } from "../api/api.js";
import { useFreshResource } from "../hooks/useFreshResource.js";
import { savedTrackingToken, rememberTracking } from "../utils/guestTracking.js";
import { formatPrice } from "../utils/currency.js";
import OrderStatusBadge from "./account/OrderStatusBadge.jsx";

function GuestOrderTracking() {
  const trackingNumber = useSearchParams().get("track") || "";
  const [number, setNumber] = useState("");
  const [token, setToken] = useState("");
  const [request, setRequest] = useState(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const orderNumber = trackingNumber;
    if (!orderNumber) return;
    setNumber(orderNumber);setExpanded(true);
    try {const secret = savedTrackingToken(window.sessionStorage, orderNumber);setToken(secret);setRequest(secret ? { number: orderNumber, token: secret } : null);} catch {setToken("");setRequest(null);}
  }, [trackingNumber]);
  const resource = useFreshResource({ identity: request && expanded ? `${request.number}:${request.token}` : "", intervalMs: 10000,
    stopWhen: (value) => ["delivered", "completed", "cancelled", "refunded", "failed"].includes(value?.status),
    fetcher: (options) => trackGuestOrder(request.number, request.token, options) });
  const order = resource.data;
  return <section className="mt-8 rounded-xl border border-dune-border p-4">
    <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls="guest-tracking-content" className="min-h-11 text-dune-amber">{t("Track a guest order")}</button>
    {expanded && <div id="guest-tracking-content"><form onSubmit={(event) => {event.preventDefault();const details = { number: number.trim(), token: token.trim() };try {rememberTracking(window.sessionStorage, { orderNumber: details.number, trackingToken: details.token });} catch {/* Tracking still works without persistence. */}setRequest(details);}} className="mt-4 flex flex-wrap gap-3">
      <label className="min-w-0 basis-full flex-1 sm:basis-0 text-sm text-neutral-300">{t("Order number")}<input required dir="ltr" maxLength={100} value={number} onChange={(event) => {const value = event.target.value;setNumber(value);try {setToken(savedTrackingToken(window.sessionStorage, value));} catch {setToken("");}}} className="mt-1 w-full rounded border border-dune-border bg-black p-3 text-white" /></label>
      <label className="min-w-0 basis-full flex-1 sm:basis-0 text-sm text-neutral-300">{t("Private tracking code")}<input required type="password" autoComplete="off" maxLength={200} value={token} onChange={(event) => setToken(event.target.value)} className="mt-1 w-full rounded border border-dune-border bg-black p-3 text-white" /></label>
      <button className="self-end rounded bg-dune-amber px-5 py-3 font-semibold text-black">{t("Track order")}</button>
    </form><p className="mt-2 text-sm text-neutral-400">{t("Your private code stays out of the URL. Keep the code from your confirmation to track on another device.")}</p>
    {request && resource.status === "loading" && <p role="status" className="mt-4 text-neutral-400">{t("Loading order…")}</p>}
    {resource.error && <p role="alert" className="mt-4 text-amber-300">{t(resource.errorKind === "throttled" ? "Too many tracking attempts. Updates will resume after the server cooldown." : order ? "Updates unavailable; showing the last synchronized order." : "Unable to track this order. Check the number and private code, then retry.")}<button type="button" onClick={() => resource.refresh("manual")} className="ml-3 underline">{t("Retry")}</button></p>}
    {order && <div className="mt-4 space-y-3" aria-live="polite"><p className="text-white">{t("Order #")}<bdi>{order.orderNumber}</bdi>{t(" · ")}<OrderStatusBadge status={order.status} /></p><ul className="text-sm text-neutral-300">{order.items.map((item, index) => <li key={index}>{t(item.quantity)}{t(" × ")}{catalogText(item, "name")}</li>)}</ul><p className="text-dune-amber">{formatPrice(order.totalAmount)}</p><p className="text-sm text-neutral-400">{t("Last synchronized ")}{formatDate(resource.lastSuccessAt, { timeStyle: "medium" })}{t(" Riyadh · ")}{t(resource.complete ? "Final order status · automatic updates stopped" : "Updates every 10 seconds while this page is visible")}</p></div>}
    </div>}
  </section>;
}

export default withLocale(GuestOrderTracking);
