"use client";

import { useEffect, useRef, useState } from "react";
import { createOrderSupport, fetchOrderSupport, replyOrderSupport } from "@/src/api/api.js";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";

const field = "mt-2 w-full rounded-lg border border-dune-border bg-black p-3 text-sm text-white outline-none focus:border-dune-amber";
const button = "min-h-11 rounded-lg border border-dune-amber/40 px-4 text-sm font-semibold text-dune-amber disabled:opacity-50";
const categories = ["Missing item", "Wrong item", "Food quality issue", "Other issue"];

function Conversation({ order, token }) {
  const [ticket, setTicket] = useState(null), [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false), [error, setError] = useState("");
  const [category, setCategory] = useState(categories[0]), [description, setDescription] = useState(""), [affectedItems, setAffectedItems] = useState([]);
  const [text, setText] = useState(""), [saving, setSaving] = useState(false), [version, setVersion] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetchOrderSupport(order.orderNumber, token, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setTicket(value); setLoaded(true); } }).catch(error => { if (!controller.signal.aborted) { setLoaded(false); setError(error.response?.data?.message || "Unable to load support. Please retry."); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [order.orderNumber, token, version]);
  const submit = async event => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setSaving(true); setError("");
    try {
      const value = ticket ? await replyOrderSupport(order.orderNumber, { text }, token) : await createOrderSupport(order.orderNumber, { category, description, affectedItems }, token);
      setTicket(value); setText("");
    } catch (error) { setError(error.response?.data?.message || "Unable to send your request. Your text has been kept."); }
    finally { lock.current = false; setSaving(false); }
  };
  return <div className="mt-4 space-y-4" lang="en" dir="ltr">
    {error && <p role="alert" className="text-sm text-amber-300">{error}<button type="button" disabled={saving} onClick={() => setVersion(value => value + 1)} className="ml-3 underline">Refresh support</button></p>}
    {loading ? <p role="status" className="text-sm text-neutral-400">Loading support…</p> : ticket ? <>
      <p className="text-sm text-white">{ticket.category} <span className="ml-2 rounded-full bg-dune-amber/10 px-3 py-1 text-xs text-dune-amber">{ticket.status}</span></p>
      <p className="whitespace-pre-wrap break-words text-sm text-neutral-300">{ticket.description}</p>
      {!!ticket.affectedItems?.length && <p className="text-xs text-neutral-400">Affected items: {ticket.affectedItems.map(index => order.items[index]?.name).filter(Boolean).join(", ")}</p>}
      <ul className="space-y-3">{ticket.messages.map(message => <li key={message._id} className="rounded-lg border border-white/10 p-3"><p className="text-xs text-dune-amber">{message.authorType} · {new Date(message.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })} Riyadh</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-300">{message.text}</p></li>)}</ul>
      {ticket.resolution && <p className="whitespace-pre-wrap break-words rounded-lg border border-emerald-500/30 p-3 text-sm text-emerald-300">Resolution: {ticket.resolution}</p>}
      {ticket.status !== "Closed" && <form onSubmit={submit} className="space-y-3"><label className="block text-sm text-neutral-300">Your reply<textarea required maxLength={2000} rows={3} className={field} value={text} onChange={event => setText(event.target.value)} disabled={saving} /></label><button className={button} disabled={saving}>{saving ? "Sending…" : "Send reply"}</button></form>}
      <button type="button" className={button} disabled={saving} onClick={() => setVersion(value => value + 1)}>Refresh conversation</button>
    </> : loaded && <form onSubmit={submit} className="space-y-4"><fieldset disabled={saving} className="space-y-4">
      <label className="block text-sm text-neutral-300">Issue category<DarkSelect aria-label="Issue category" className={field} value={category} onChange={event => setCategory(event.target.value)}>{categories.map(value => <option key={value}>{value}</option>)}</DarkSelect></label>
      <fieldset><legend className="text-sm text-neutral-300">Affected items</legend><div className="mt-2 space-y-2">{order.items.map((item, index) => <label key={index} className="flex min-h-10 items-center gap-3 text-sm text-neutral-400"><input type="checkbox" checked={affectedItems.includes(index)} onChange={event => setAffectedItems(current => event.target.checked ? [...current, index] : current.filter(value => value !== index))} className="accent-amber-500" />{item.name} × {item.quantity}</label>)}</div></fieldset>
      <label className="block text-sm text-neutral-300">Describe the issue<textarea required minLength={10} maxLength={2000} rows={4} className={field} value={description} onChange={event => setDescription(event.target.value)} /></label>
      <p className="text-xs text-neutral-500">One conversation per order. Include all issues here. Submitting a request does not automatically refund or cancel your order.</p>
      <button className={button} disabled={saving}>{saving ? "Submitting…" : "Submit issue"}</button>
    </fieldset></form>}
  </div>;
}

export default function OrderSupportPanel({ order, token }) {
  const [open, setOpen] = useState(false);
  return <section className="mt-5 border-t border-dune-border pt-4" lang="en" dir="ltr"><button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className={button}>Get help with this order</button>{open && <Conversation key={`${order.orderNumber}:${token || "account"}`} order={order} token={token} />}</section>;
}
