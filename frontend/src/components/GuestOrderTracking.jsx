"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { trackGuestOrder } from "../api/api.js";
import { useFreshResource } from "../hooks/useFreshResource.js";
import { savedTrackingToken, rememberTracking } from "../utils/guestTracking.js";
import { formatPrice } from "../utils/currency.js";
import OrderStatusBadge from "./account/OrderStatusBadge.jsx";

export default function GuestOrderTracking() {
  const trackingNumber = useSearchParams().get("track") || "";
  const [number, setNumber] = useState("");
  const [token, setToken] = useState("");
  const [request, setRequest] = useState(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const orderNumber = trackingNumber;
    if (!orderNumber) return;
    setNumber(orderNumber); setExpanded(true);
    try { const secret = savedTrackingToken(window.sessionStorage, orderNumber); setToken(secret); setRequest(secret ? { number: orderNumber, token: secret } : null); } catch { setToken(""); setRequest(null); }
  }, [trackingNumber]);
  const resource = useFreshResource({ identity: request ? `${request.number}:${request.token}` : "", intervalMs: 10000,
    fetcher: () => trackGuestOrder(request.number, request.token) });
  const order = resource.data;
  return <section className="mt-8 rounded-xl border border-dune-border p-4">
    <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="text-dune-amber">Track a guest order</button>
    {expanded && <><form onSubmit={event => { event.preventDefault(); const details = { number: number.trim(), token: token.trim() }; try { rememberTracking(window.sessionStorage, { orderNumber: details.number, trackingToken: details.token }); } catch { /* Tracking still works without persistence. */ } setRequest(details); }} className="mt-4 flex flex-wrap gap-3">
      <label className="flex-1 text-sm text-neutral-400">Order number<input required maxLength={100} value={number} onChange={event => { const value = event.target.value; setNumber(value); try { setToken(savedTrackingToken(window.sessionStorage, value)); } catch { setToken(""); } }} className="mt-1 w-full rounded border border-dune-border bg-black p-3 text-white" /></label>
      <label className="flex-1 text-sm text-neutral-400">Private tracking code<input required type="password" autoComplete="off" maxLength={200} value={token} onChange={event => setToken(event.target.value)} className="mt-1 w-full rounded border border-dune-border bg-black p-3 text-white" /></label>
      <button className="self-end rounded bg-dune-amber px-5 py-3 font-semibold text-black">Track order</button>
    </form><p className="mt-2 text-xs text-neutral-500">Your private code stays out of the URL. Keep the code from your confirmation to track on another device.</p>
    {request && resource.status === "loading" && <p role="status" className="mt-4 text-neutral-400">Loading order…</p>}
    {resource.error && <p role="alert" className="mt-4 text-amber-300">{order ? "Updates unavailable; showing the last synchronized order." : "Unable to track this order. Check the number and private code, then retry."}<button type="button" onClick={() => resource.refresh("manual")} className="ml-3 underline">Retry</button></p>}
    {order && <div className="mt-4 space-y-3" aria-live="polite"><p className="text-white">Order #{order.orderNumber} · <OrderStatusBadge status={order.status} /></p><ul className="text-sm text-neutral-300">{order.items.map((item, index) => <li key={index}>{item.quantity} × {item.name}</li>)}</ul><p className="text-dune-amber">{formatPrice(order.totalAmount)}</p><p className="text-xs text-neutral-500">Last synchronized {new Date(resource.lastSuccessAt).toLocaleTimeString()} · Updates every 10 seconds</p></div>}
    </>}
  </section>;
}
