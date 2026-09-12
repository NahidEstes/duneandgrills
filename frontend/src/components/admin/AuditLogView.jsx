"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { fetchAuditLogs } from "../../api/api.js";
import DarkDatePicker from "../ui/DarkDatePicker.jsx";
import DarkSelect from "../ui/DarkSelect.jsx";
import { formatAdminDate, labelStatus } from "./adminUi.js";

const CARD = "rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] to-white/[0.018]";
const inputClass = "h-10 rounded-lg border border-white/10 bg-[#101315] px-3 text-sm text-neutral-300 outline-none focus:border-dune-amber/60";

const ValueBlock = ({ title, value }) => <div><p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-600">{title}</p><pre className="max-h-56 overflow-auto rounded-lg border border-white/[0.07] bg-black/30 p-3 text-[0.7rem] leading-5 text-neutral-300">{value ? JSON.stringify(value, null, 2) : "—"}</pre></div>;

export default function AuditLogView() {
  const [filters, setFilters] = useState({ search: "", entityType: "all", action: "all", from: "", to: "" });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState({ data: [], filters: {}, pagination: {} });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState("");

  useEffect(() => { const timeout = setTimeout(() => { setDebouncedSearch(filters.search.trim()); setPage(1); }, 250); return () => clearTimeout(timeout); }, [filters.search]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAuditLogs({ page, limit: 25, ...filters, search: debouncedSearch })
      .then((data) => active && setPayload(data))
      .catch((error) => active && toast.error(error.response?.data?.message || "Unable to load audit logs."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [page, filters.entityType, filters.action, filters.from, filters.to, debouncedSearch]);

  const set = (field, value) => { setFilters((current) => ({ ...current, [field]: value })); if (field !== "search") setPage(1); };
  const pagination = payload.pagination || {};

  return <div className="space-y-4">
    <section className={`${CARD} grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[minmax(230px,1.4fr)_1fr_1fr_170px_170px]`}>
      <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-neutral-600" /><input className={`${inputClass} w-full pl-9`} value={filters.search} onChange={(event) => set("search", event.target.value)} placeholder="Search actor, action or record…" /></label>
      <DarkSelect className={inputClass} value={filters.entityType} onChange={(event) => set("entityType", event.target.value)}><option value="all">All record types</option>{(payload.filters?.entityTypes || []).map((value) => <option key={value} value={value}>{value}</option>)}</DarkSelect>
      <DarkSelect className={inputClass} value={filters.action} onChange={(event) => set("action", event.target.value)}><option value="all">All actions</option>{(payload.filters?.actions || []).map((value) => <option key={value} value={value}>{labelStatus(value.toLowerCase().replaceAll("_", "-"))}</option>)}</DarkSelect>
      <DarkDatePicker className={inputClass} value={filters.from} onChange={(event) => set("from", event.target.value)} placeholder="From" />
      <DarkDatePicker className={inputClass} value={filters.to} onChange={(event) => set("to", event.target.value)} placeholder="To" />
    </section>
    <section className={`${CARD} overflow-hidden`}>
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3"><ShieldCheck className="h-4 w-4 text-dune-amber" /><div><h2 className="text-sm font-semibold text-white">Permanent Admin Activity</h2><p className="text-xs text-neutral-600">Old and new values are stored with the actor and timestamp.</p></div>{loading && <RefreshCw className="ml-auto h-4 w-4 animate-spin text-dune-amber" />}</div>
      <div className="divide-y divide-white/[0.06]">{payload.data.map((row) => <article key={row._id}>
        <button type="button" onClick={() => setExpanded((current) => current === row._id ? "" : row._id)} className="grid w-full gap-2 px-4 py-3 text-left hover:bg-white/[0.025] sm:grid-cols-[minmax(180px,1.2fr)_1fr_1fr_auto] sm:items-center">
          <span><span className="block text-sm font-medium text-white">{row.entityLabel || row.entityType}</span><span className="text-xs text-neutral-600">{row.entityType}</span></span>
          <span><span className="block text-xs text-dune-amber">{labelStatus(row.action.toLowerCase().replaceAll("_", "-"))}</span><span className="text-xs capitalize text-neutral-600">{row.actorName} · {row.actorRole}</span></span>
          <span className="text-xs text-neutral-500">{formatAdminDate(row.createdAt, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          {expanded === row._id ? <ChevronUp className="h-4 w-4 text-neutral-500" /> : <ChevronDown className="h-4 w-4 text-neutral-500" />}
        </button>
        {expanded === row._id && <div className="grid gap-3 border-t border-white/[0.05] bg-black/20 p-4 lg:grid-cols-2"><ValueBlock title="Before" value={row.before} /><ValueBlock title="After" value={row.after} />{row.metadata && Object.keys(row.metadata).length > 0 && <div className="lg:col-span-2"><ValueBlock title="Metadata" value={row.metadata} /></div>}</div>}
      </article>)}{!loading && !payload.data.length && <p className="py-14 text-center text-sm text-neutral-600">No audit activity matches these filters.</p>}</div>
      <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-3 text-xs text-neutral-600"><span>{pagination.total || 0} audit entries</span><div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-white/10 px-3 py-1.5 text-neutral-400 disabled:opacity-30">Previous</button><span>Page {page} of {pagination.pages || 1}</span><button type="button" disabled={page >= (pagination.pages || 1)} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-white/10 px-3 py-1.5 text-neutral-400 disabled:opacity-30">Next</button></div></div>
    </section>
  </div>;
}
