"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { fetchPurchasingActions, refreshPurchasingActions, updatePurchasingActionState } from "@/src/api/inventoryApi.js";
import { Badge, Button, DataTable, EmptyState, LoadingState, PageHeader, Pagination, StatCard, cardClass, inputClass } from "./InventoryUI.jsx";
import { apiErrorMessage, formatDate, humanize } from "./inventoryUtils.js";

const tones = { critical: "danger", high: "warning", medium: "info", low: "neutral" };

export default function PurchasingActionCenterPage() {
  const { user } = useAuth(); const canManage = ["admin", "manager"].includes(user?.role);
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [page, setPage] = useState(1); const [state, setState] = useState(""); const [severity, setSeverity] = useState(""); const [search, setSearch] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setData(await fetchPurchasingActions({ page, state, severity, search })); } catch (error) { toast.error(apiErrorMessage(error, "Unable to load purchasing actions.")); } finally { setLoading(false); } }, [page, search, severity, state]);
  useEffect(() => { load(); }, [load]);
  const refresh = async () => { setBusy(true); try { await refreshPurchasingActions(); await load(); toast.success("Purchasing conditions scanned."); } catch (error) { toast.error(apiErrorMessage(error, "Action scan failed.")); } finally { setBusy(false); } };
  const transition = async (row, nextState) => { const reason = nextState === "resolved" ? window.prompt("Resolution note") : ""; if (nextState === "resolved" && !reason) return; try { await updatePurchasingActionState(row._id, { state: nextState, reason, ...(nextState === "snoozed" ? { hours: 24 } : {}) }); await load(); toast.success(`Action ${nextState}.`); } catch (error) { toast.error(apiErrorMessage(error)); } };
  const columns = [
    { key: "severity", label: "Severity", render: (row) => <Badge tone={tones[row.severity]}>{humanize(row.severity)}</Badge> },
    { key: "action", label: "Action", render: (row) => <div className="max-w-md whitespace-normal"><p className="font-medium text-white">{row.title}</p><p className="mt-1 text-xs leading-5 text-neutral-500">{row.explanation}</p></div> },
    { key: "type", label: "Type", render: (row) => humanize(row.actionType) },
    { key: "detected", label: "Detected / due", render: (row) => <div>{formatDate(row.lastDetectedAt, true)}<p className="text-[0.65rem] text-neutral-600">{row.dueAt ? `Due ${formatDate(row.dueAt)}` : `Occurrence ${row.occurrenceCount}`}</p></div> },
    { key: "state", label: "State", render: (row) => <Badge tone={row.state === "resolved" ? "success" : row.state === "snoozed" ? "violet" : "neutral"}>{humanize(row.state)}</Badge> },
    { key: "link", label: "Related", render: (row) => <Link href={row.href} className="font-semibold text-dune-amber hover:text-dune-amberLight">Open record</Link> },
    { key: "actions", label: "Controls", render: (row) => canManage && row.state !== "resolved" ? <div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => transition(row, "acknowledged")}>Acknowledge</Button><Button size="sm" variant="ghost" onClick={() => transition(row, "snoozed")}>Snooze 24h</Button><Button size="sm" variant="ghost" onClick={() => transition(row, "resolved")}>Resolve</Button></div> : "—" },
  ];
  const summary = data?.summary || {};
  return <div className="mx-auto max-w-[1680px]"><PageHeader title="Purchasing Action Center" description="Prioritized purchasing, supplier, delivery and payable exceptions with direct links to the source record." actions={<Button variant="secondary" onClick={refresh} disabled={!canManage || busy}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />Scan conditions</Button>} /><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Open" value={summary.open || 0} icon={ShieldAlert} tone="red" /><StatCard label="Acknowledged" value={summary.acknowledged || 0} icon={BellRing} tone="amber" /><StatCard label="Snoozed" value={summary.snoozed || 0} icon={Clock3} tone="violet" /><StatCard label="Resolved" value={summary.resolved || 0} icon={CheckCircle2} tone="green" /></section><section className={`${cardClass} mt-4`}><div className="grid gap-3 border-b border-white/10 p-4 md:grid-cols-[minmax(240px,1fr)_220px_220px]"><input className={inputClass} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search action…" /><DarkSelect className={inputClass} value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); }}><option value="">All severities</option>{["critical", "high", "medium", "low"].map((value) => <option key={value}>{value}</option>)}</DarkSelect><DarkSelect className={inputClass} value={state} onChange={(event) => { setState(event.target.value); setPage(1); }}><option value="">All states</option>{["open", "acknowledged", "snoozed", "resolved"].map((value) => <option key={value}>{value}</option>)}</DarkSelect></div>{loading ? <LoadingState /> : <DataTable columns={columns} rows={data?.data} empty={<EmptyState title="No purchasing actions" description="Run a condition scan to refresh the action center." />} />}<Pagination pagination={data?.pagination} onPageChange={setPage} /></section></div>;
}
