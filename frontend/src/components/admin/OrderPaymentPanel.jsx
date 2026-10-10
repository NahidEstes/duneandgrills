"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { collectOrderPayment, fetchOrderById } from "../../api/api.js";

export default function OrderPaymentPanel({ order, onChanged }) {
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [terminal, setTerminal] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const attempt = useRef(null);
  const inFlight = useRef(false);
  if (!["ready", "out-for-delivery", "delivered"].includes(order.status) || !["pending", "unpaid"].includes(order.paymentStatus) || order.manualEntry) return null;
  return <section className="my-4 rounded-xl border border-dune-border p-4 text-sm text-neutral-300"><h3 className="font-semibold text-white">Record collected payment · SAR {Number(order.totalAmount).toFixed(2)}</h3><p className="mt-2 text-xs">Confirm money actually received. Card/manual payments require an external reference.</p>
    <select aria-label="Collected payment method" value={method} disabled={busy || retryPending} onChange={event => setMethod(event.target.value)} className="my-3 min-h-11 rounded-lg bg-black px-3"><option value="cash">Cash / COD</option><option value="card">Card terminal</option><option value="other">Manual payment</option></select>
    <input aria-label="Collected payment reference" value={reference} disabled={busy || retryPending} maxLength={160} onChange={event => setReference(event.target.value)} placeholder="Terminal / manual reference" className="ml-2 min-h-11 rounded-lg bg-black px-3" />
    {method === "cash" && <input aria-label="Cash collection terminal" value={terminal} disabled={busy || retryPending} maxLength={60} onChange={event => setTerminal(event.target.value.toUpperCase())} placeholder="Cash drawer terminal (if multiple open)" className="ml-2 min-h-11 rounded-lg bg-black px-3" />}
    <button type="button" disabled={busy} className="ml-2 min-h-11 text-dune-amber" onClick={async () => { if (inFlight.current) return; inFlight.current = true; setBusy(true); try { attempt.current ||= { idempotencyKey: crypto.randomUUID(), method, reference, terminal: method === "cash" ? terminal : undefined, amount: order.totalAmount }; setRetryPending(true); await collectOrderPayment(order._id, attempt.current); await onChanged(await fetchOrderById(order._id)); attempt.current = null; setRetryPending(false); toast.success("Collected payment recorded"); } catch (error) { if ([400, 422].includes(error.response?.status)) { attempt.current = null; setRetryPending(false); } toast.error(error.response?.data?.message || "Collection status uncertain. Retry this payment request."); } finally { inFlight.current = false; setBusy(false); } }}>Confirm collected payment</button>
  </section>;
}
