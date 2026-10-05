"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import AdminShell from "../AdminShell.jsx";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { fetchRecordDetails, searchRecordIds } from "@/src/api/api.js";
import RecordId from "@/src/components/ui/RecordId.jsx";
import { formatAdminDate } from "../adminUi.js";
import { downloadCsv } from "@/src/utils/adminExports.js";
import { RECORD_EXPORT_HEADINGS, recordExportRows } from "@/src/utils/recordIdExports.js";

function RecordSummary({ record }) {
  return <article className="rounded-xl border border-white/10 bg-[#101416] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs uppercase tracking-widest text-dune-amber">{record.type}</span><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-neutral-300">{record.status}</span></div><h2 className="my-3 break-words text-lg font-semibold text-white">{record.title}</h2><dl className="space-y-3 text-sm">{Object.entries(record.identifiers).map(([label, value]) => <div key={label}><dt className="mb-1 text-xs text-neutral-500">{label}</dt><dd><RecordId value={value} /></dd></div>)}{record.context && <div><dt className="text-neutral-500">Context</dt><dd className="break-words">{record.context}</dd></div>}<div><dt className="text-neutral-500">Date</dt><dd>{formatAdminDate(record.date)}</dd></div></dl></article>;
}

export default function RecordSearchPage({ detailType = "", detailId = "" }) {
  const { user, logout } = useAuth(); const router = useRouter();
  const [query, setQuery] = useState(""); const [page, setPage] = useState(1); const [result, setResult] = useState(null);
  const [detail, setDetail] = useState(null); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setDetail(null); setError(""); setDetailLoading(Boolean(detailType && detailId));
    if (detailType && detailId) {
      setDetailLoading(true);
      fetchRecordDetails(detailType, detailId).then(record => { if (active) setDetail(record); }).catch(error => { if (active) setError(error.response?.data?.message || "Unable to load record"); }).finally(() => { if (active) setDetailLoading(false); });
    }
    return () => { active = false; };
  }, [detailType, detailId]);
  useEffect(() => {
    if (query.trim().length < 2) { setResult(null); setLoading(false); return; }
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try { const data = await searchRecordIds({ q: query.trim(), page }); if (active) setResult(data); }
      catch (error) { if (active) { setResult(null); setError(error.response?.data?.message || "Unable to search records"); } }
      finally { if (active) setLoading(false); }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query, page]);
  return <AdminShell activeTab="record-search" user={user} onLogout={logout} title="Search by ID" subtitle="Find readable IDs and historical references. Only records permitted for your account are shown." onTabChange={tab => router.push(`/admin?tab=${tab}`)} showGlobalSearch={false}>
    <div className="mx-auto max-w-5xl space-y-5"><label className="relative block"><span className="mb-2 block text-sm text-neutral-300">Record ID / external reference</span><Search className="absolute bottom-3.5 left-4 h-4 w-4 text-dune-amber" /><input type="search" aria-label="Search by ID" value={query} maxLength={120} onChange={event => { setQuery(event.target.value); setPage(1); setDetail(null); }} placeholder="EXP-2026-000001, SKU, invoice, lot, employee…" className="h-12 w-full rounded-xl border border-white/10 bg-black/30 pl-11 pr-4 text-white outline-none focus:border-dune-amber" /></label>
      {error && <p role="alert" className="rounded-xl border border-red-500/20 p-4 text-red-300">{error}</p>}{(loading || detailLoading) && <p role="status" className="text-neutral-400">Loading…</p>}
      {detail && <RecordSummary record={detail} />}
      {(detail || result?.data?.length > 0) && <button type="button" className="rounded-lg border border-dune-amber/30 px-4 py-2 text-sm text-dune-amber" onClick={() => downloadCsv("record-ids.csv", RECORD_EXPORT_HEADINGS, recordExportRows(detail ? [detail] : result.data))}>Export displayed records CSV</button>}
      {!detail && !loading && result?.data?.length === 0 && <p className="text-neutral-400">No permitted matching records.</p>}
      {!detail && result?.data?.map(record => <div key={`${record.type}:${record.id}`} className="rounded-xl border border-white/10 bg-[#101416] p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><RecordId value={record.readableId} /><span className="text-xs text-dune-amber">{record.type} · {record.status}</span></div><Link href={record.href} className="block break-words text-white hover:text-dune-amber">{record.title} · View details →</Link>{record.context && <p className="mt-1 break-words text-sm text-neutral-400">{record.context}</p>}<p className="mt-1 text-xs text-neutral-500">{formatAdminDate(record.date)}</p></div>)}
      {!detail && result && <div className="flex items-center gap-4"><button disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} className="rounded-lg border border-white/10 px-4 py-2 disabled:opacity-40">Previous</button><span>Page {page}</span><button disabled={!result.pagination.hasMore || loading} onClick={() => setPage(page + 1)} className="rounded-lg border border-white/10 px-4 py-2 disabled:opacity-40">Next</button></div>}
      {!result && !detail && !error && !loading && <p className="text-sm text-neutral-500">Enter at least two characters. Vendor invoice and batch results include supplier/item context.</p>}
    </div>
  </AdminShell>;
}
