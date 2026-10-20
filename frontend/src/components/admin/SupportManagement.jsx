"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSupportCase, fetchSupportCases, updateSupportCase } from "@/src/api/api.js";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import { inputClass, panelClass } from "./staff/staffUi.jsx";

const statuses = ["Open", "In Progress", "Resolved", "Closed"];
const button = "min-h-11 rounded-xl border border-dune-amber/30 px-4 text-sm font-semibold text-dune-amber disabled:opacity-50";
const message = error => error.response?.data?.message || "Unable to load support. Please retry.";

function CaseDetail({ id, onBack, onChanged }) {
  const [ticket, setTicket] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Open"), [resolution, setResolution] = useState(""), [text, setText] = useState(""), [internal, setInternal] = useState(false), [version, setVersion] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    fetchSupportCase(id).then(value => { if (active) { setTicket(value); setStatus(value.status); setResolution(value.resolution); } }).catch(error => { if (active) setError(message(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, version]);
  const save = async event => {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setSaving(true); setError("");
    try { const value = await updateSupportCase(id, { text, internal, status, resolution }); setTicket(current => ({ ...current, ...value })); setText(""); onChanged(); }
    catch (error) { setError(message(error)); }
    finally { lock.current = false; setSaving(false); }
  };
  return <section className={`${panelClass} space-y-5 p-4 sm:p-6`}><div className="flex flex-wrap justify-between gap-3"><button type="button" onClick={onBack} className={button}>Back to support cases</button><button type="button" disabled={saving} onClick={() => setVersion(value => value + 1)} className={button}>Refresh case</button></div>
    {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}{loading ? <p role="status" className="text-neutral-400">Loading conversation…</p> : ticket && <>
      <header><h2 className="text-lg font-semibold text-white">{ticket.orderNumber} · {ticket.category}</h2><p className="mt-1 text-sm text-neutral-400">{ticket.order?.customer?.name || "Guest"} · {ticket.order?.customer?.phone}{ticket.order?.customer?.email ? ` · ${ticket.order.customer.email}` : ""}</p>{ticket.order && <Link href={`/admin?tab=orders&order=${ticket.order._id}`} className="mt-2 inline-block text-sm text-dune-amber underline">View order and existing refund actions</Link>}</header>
      <p className="whitespace-pre-wrap break-words text-sm text-neutral-300">{ticket.description}</p>
      <p className="text-sm text-neutral-400">Affected items: {ticket.affectedItems.map(index => ticket.order?.items?.[index]?.name).filter(Boolean).join(", ") || "Whole order / unspecified"}</p>
      <ul className="space-y-3">{ticket.messages.map(row => <li key={row._id} className={`rounded-xl border p-4 ${row.internal ? "border-amber-500/30 bg-amber-500/5" : "border-white/10"}`}><p className="text-xs text-dune-amber">{row.internal ? "Internal note · " : ""}{row.authorType} · {new Date(row.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })} Riyadh</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-neutral-300">{row.text}</p></li>)}</ul>
      <form onSubmit={save}><fieldset disabled={saving} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm text-neutral-300">Support status<DarkSelect aria-label="Support status" className={`${inputClass} mt-2`} value={status} onChange={event => setStatus(event.target.value)}>{statuses.map(value => <option key={value}>{value}</option>)}</DarkSelect></label><label className="flex min-h-11 items-center gap-3 text-sm text-neutral-300"><input type="checkbox" checked={internal} onChange={event => setInternal(event.target.checked)} className="accent-amber-500" />Save message as internal note</label></div>
        <label className="block text-sm text-neutral-300">{internal ? "Internal note (staff only)" : "Reply to customer"}<textarea rows={4} maxLength={2000} className={`${inputClass} mt-2 h-auto py-3`} value={text} onChange={event => setText(event.target.value)} /></label>
        <label className="block text-sm text-neutral-300">Resolution (always visible to customer)<textarea rows={3} maxLength={2000} required={["Resolved", "Closed"].includes(status)} className={`${inputClass} mt-2 h-auto py-3`} value={resolution} onChange={event => setResolution(event.target.value)} /></label>
        <p className="text-xs text-neutral-500">Support changes do not automatically change payments, refunds, stock, rewards or order status.</p><button className={button} disabled={saving}>{saving ? "Saving…" : "Save support update"}</button>
      </fieldset></form>
    </>}
  </section>;
}

export default function SupportManagement() {
  const [data, setData] = useState(null), [search, setSearch] = useState(""), [status, setStatus] = useState("all"), [page, setPage] = useState(1);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [selected, setSelected] = useState(null), [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    const timer = setTimeout(() => fetchSupportCases({ search, status, page }).then(value => { if (active) setData(value); }).catch(error => { if (active) setError(message(error)); }).finally(() => { if (active) setLoading(false); }), 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, status, page, version]);
  if (selected) return <CaseDetail key={selected} id={selected} onBack={() => setSelected(null)} onChanged={refresh} />;
  return <div className="space-y-4"><div className={`${panelClass} flex flex-wrap gap-3 p-3`}><input type="search" aria-label="Search support by order number" placeholder="Search order number…" className={`${inputClass} sm:max-w-sm`} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /><DarkSelect aria-label="Filter support status" className={`${inputClass} sm:max-w-52`} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">All statuses</option>{statuses.map(value => <option key={value}>{value}</option>)}</DarkSelect><button type="button" className={button} onClick={refresh}>Refresh cases</button></div>
    {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}{loading ? <p role="status" className="text-sm text-neutral-400">Loading support cases…</p> : !error && <>{!data?.data.length ? <p className={`${panelClass} p-8 text-center text-neutral-400`}>No support cases found.</p> : <div className="grid gap-3 lg:grid-cols-2">{data.data.map(row => <button type="button" key={row._id} onClick={() => setSelected(row._id)} className={`${panelClass} space-y-2 p-4 text-left hover:border-dune-amber/40`}><span className="block font-semibold text-white">{row.orderNumber}</span><span className="block text-sm text-dune-amber">{row.category} · {row.status}</span><span className="block line-clamp-2 break-words text-sm text-neutral-400">{row.description}</span><span className="block text-xs text-neutral-500">View conversation</span></button>)}</div>}<div className="flex items-center gap-3 text-sm text-neutral-400"><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} className={button}>Previous</button><span>Page {page}</span><button type="button" disabled={page >= (data?.pagination.pages || 1)} onClick={() => setPage(value => value + 1)} className={button}>Next</button></div></>}
  </div>;
}
