"use client";
import { useEffect, useRef, useState } from "react";
import { findEnrollmentOrder, enrollRestaurantDelivery } from "@/src/api/deliveryApi.js";
import useDeliverySubmission from "@/src/hooks/useDeliverySubmission.js";
import { inputClass, panelClass } from "@/src/components/admin/staff/staffUi.jsx";

export default function OwnDeliveryEnrollment({ afterChange, rehearsal = false }) {
  const [number, setNumber] = useState(""), [order, setOrder] = useState(null);
  const [lookingUp, setLookingUp] = useState(false), [error, setError] = useState("");
  const [reason, setReason] = useState(""), [pickup, setPickup] = useState(""), [note, setNote] = useState("");
  const lookupController = useRef(null), mutation = useDeliverySubmission();
  useEffect(() => () => lookupController.current?.abort(), []);
  const lookup = async () => {
    lookupController.current?.abort();
    const controller = new AbortController(); lookupController.current = controller;
    setLookingUp(true); setError(""); setOrder(null);
    try {
      if (!navigator.onLine) throw new Error("You are offline. Reconnect before looking up an order.");
      const found = await findEnrollmentOrder(number, controller.signal);
      if (!controller.signal.aborted) setOrder(found);
    } catch (error) { if (!controller.signal.aborted) setError(error.response?.data?.message || error.message); }
    finally { if (!controller.signal.aborted) setLookingUp(false); }
  };
  const enroll = () => mutation.submit("enroll", { expectedRevision: order.revision, reason, pickupInstructions: pickup, deliveryNote: note },
    payload => enrollRestaurantDelivery(order.id, payload), () => { setOrder(null); setNumber(""); setReason(""); setPickup(""); setNote(""); afterChange(); });
  return <section className={`${panelClass} space-y-4 p-5`} aria-label="Enroll existing own-delivery order">
    <h2 className="font-body text-lg font-semibold">{rehearsal ? "Explicitly enroll an existing test order" : "Enroll an existing restaurant delivery order"}</h2>
    <p className="text-xs text-neutral-400">No new sale is created. Takeaway, dine-in, platform/historical and voided orders are rejected by the server.</p>
    <div className="flex flex-wrap gap-3">
      <label className="min-w-0 flex-1"><span className="sr-only">Existing order number</span><input placeholder="Exact existing order number" value={number} onChange={event => { setNumber(event.target.value); setOrder(null); }} maxLength={80} disabled={lookingUp || mutation.pending} className={inputClass} /></label>
      <button type="button" disabled={!number.trim() || lookingUp || mutation.pending} onClick={lookup} className="min-h-11 rounded-xl border border-dune-amber px-4 text-dune-amber">Find Existing Order</button>
    </div>
    {lookingUp && <p role="status">Looking up the exact existing order…</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {order && <>
      <p>{order.orderNumber} · {order.source} · {order.orderType} · {order.status}</p>
      <label className="block text-sm">Own-delivery authorization reason<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} className={`${inputClass} mt-2 h-20 p-3`} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">Pickup instructions (optional)<input value={pickup} onChange={event => setPickup(event.target.value)} maxLength={300} placeholder="Restaurant pickup counter" className={`${inputClass} mt-2`} /></label>
        <label className="block text-sm">Delivery note (optional)<input value={note} onChange={event => setNote(event.target.value)} maxLength={300} className={`${inputClass} mt-2`} /></label>
      </div>
      <button type="button" disabled={!reason.trim() || mutation.pending} onClick={enroll} className="min-h-11 rounded-xl bg-dune-amber px-4 font-medium text-black">{rehearsal ? "Enroll Own Delivery · Isolated Test" : "Enroll Own Delivery"}</button>
    </>}
    {mutation.error && <p role="alert" className="text-red-300">{mutation.error}</p>}
    {mutation.message && <p role="status" className="text-emerald-300">{mutation.message}</p>}
  </section>;
}
