"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { exportPlannerInsights, fetchPlannerInsights, fetchPlannerPersonTasks } from "@/src/api/api.js";
import { PLANNER_CATEGORIES, plannerDay } from "@/src/utils/planner.js";
import { inputClass, panelClass } from "../staff/staffUi.jsx";
import { PlannerTiming, plannerTimestamp } from "./PlannerTaskDetails.jsx";

const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-xs text-neutral-300 hover:border-dune-amber/50 disabled:opacity-40";
const field = `${inputClass} mt-2 h-10 rounded-lg [color-scheme:dark]`;
function Pager({ pagination, setPage, disabled }) {
  return pagination?.pages > 1 && <div className="flex items-center justify-end gap-3 text-xs text-neutral-400"><button type="button" disabled={disabled || pagination.page <= 1} className={button} onClick={() => setPage(pagination.page - 1)}>Previous</button><span>Page {pagination.page} of {pagination.pages}</span><button type="button" disabled={disabled || pagination.page >= pagination.pages} className={button} onClick={() => setPage(pagination.page + 1)}>Next</button></div>;
}
function TaskRows({ rows, onView, disabled, people = false }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="border-b border-white/10 text-neutral-400"><tr>{["Task", "Responsible person", "Marked done by", people ? "Due / Completed" : "Completed at", people ? "Status" : "Checklist at completion", "Action"].map(label => <th key={label} className="px-4 py-4 font-normal">{label}</th>)}</tr></thead><tbody className="divide-y divide-white/10">{rows.map(task => <tr key={task._id}><td className="max-w-xs break-words px-4 py-4 font-medium text-white">{task.reportTitle}<p className="mt-2 text-[11px] font-normal text-neutral-400">{task.reportCategory}</p>{task.status === "Done" && <div className="mt-2"><PlannerTiming task={task} /></div>}</td><td className="px-4 py-4 text-neutral-300">{task.reportResponsible?.name || "Unassigned"}{task.status === "Done" && !task.completion && <p className="mt-1 text-[11px] text-neutral-500">Current assignment</p>}</td><td className="px-4 py-4 text-neutral-300">{task.completion?.by?.name || "Not recorded"}</td><td className="px-4 py-4 text-neutral-300">{plannerTimestamp(people && task.status !== "Done" ? task.reportDueAt : task.completedAt)}</td><td className="px-4 py-4 text-neutral-300">{people ? task.status : task.completion ? `${task.completion.checklist.filter(row => row.done).length} of ${task.completion.checklist.length}` : "Not recorded"}</td><td className="px-4 py-4"><button type="button" aria-label={`${people ? "View details" : "View history"} for ${task.reportTitle}`} disabled={disabled} onClick={() => onView(task)} className={button}>{people ? "View details" : "View history"}</button></td></tr>)}</tbody></table>{!rows.length && <p className="p-8 text-center text-sm text-neutral-400">No matching reminders.</p>}</div>;
}

function PersonTasks({ params, person, version, onView }) {
  const [page, setPage] = useState(1), [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  const query = useMemo(() => ({ ...params, responsible: person.id, page }), [params, person.id, page]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setData(null);
    fetchPlannerPersonTasks(query, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(error => { if (!controller.signal.aborted) setError(error.response?.data?.message || "Unable to load this person's reminders."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, version, retry]);
  useEffect(() => { if (data && !loading && page > Math.max(1, data.pagination.pages)) setPage(Math.max(1, data.pagination.pages)); }, [data, loading, page]);
  return <section aria-label="Person reminders" className={`${panelClass} space-y-4 overflow-hidden pb-4`}><h3 className="px-4 pt-4 text-sm font-semibold text-white">{person.name} · Matching reminders</h3><p className="px-4 text-xs text-neutral-400">Same period and category as the People summary.</p>{loading && <p role="status" className="px-4 text-sm text-neutral-400">Loading person reminders…</p>}{error && <p role="alert" className="px-4 text-sm text-amber-300">{error} <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>Retry person reminders</button></p>}{data && <><TaskRows rows={data.data} onView={onView} people disabled={loading || !!error} /><div className="px-4"><Pager pagination={data.pagination} setPage={setPage} disabled={loading} /></div></>}</section>;
}

export default function PlannerInsights({ mode, version, onView }) {
  const [filters, setFilters] = useState({ period: "week", from: plannerDay(), to: plannerDay(), category: "", responsible: "", completedBy: "" });
  const [searchInput, setSearchInput] = useState(""), [search, setSearch] = useState(""), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [data, setData] = useState(null), [loadedKey, setLoadedKey] = useState(""), [loading, setLoading] = useState(true), [error, setError] = useState(""), [exportError, setExportError] = useState(""), [exporting, setExporting] = useState(false), [person, setPerson] = useState(null);
  const exportRequest = useRef(null);
  const params = useMemo(() => ({ mode, ...filters, search, page }), [mode, filters, search, page]);
  const key = JSON.stringify(params), matched = loadedKey === key, disabled = loading || !!error || !matched || searchInput.trim() !== search;
  useEffect(() => { const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [searchInput]);
  useEffect(() => {
    exportRequest.current?.abort(); setExporting(false);
    const controller = new AbortController(); setLoading(true); setError(""); setExportError("");
    fetchPlannerInsights(params, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setData(value); setLoadedKey(JSON.stringify(params)); } }).catch(error => {
      if (controller.signal.aborted) return;
      setError(error.response?.data?.message || "Unable to load Planner records. Please retry.");
      if ([401, 403].includes(error.response?.status)) { setData(null); setLoadedKey(""); setPerson(null); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); exportRequest.current?.abort(); };
  }, [params, version, retry]);
  useEffect(() => { if (data && matched && !loading && page > Math.max(1, data.pagination.pages)) setPage(Math.max(1, data.pagination.pages)); }, [data, matched, loading, page]);
  const update = (key, value) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); setPerson(null); };
  const exportCsv = async () => {
    if (disabled || exporting) return;
    const controller = new AbortController(); exportRequest.current = controller;
    setExporting(true); setExportError("");
    try {
      const blob = await exportPlannerInsights(params, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = `planner-${mode}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (controller.signal.aborted) return;
      let message = "Unable to export. No file was created. Please retry.";
      if (error.response?.data?.text) { try { message = JSON.parse(await error.response.data.text()).message || message; } catch { /* Keep the plain fallback. */ } }
      setExportError(message);
    } finally { if (!controller.signal.aborted) setExporting(false); }
  };
  const options = name => [...new Map((data?.options[name] || []).map(row => [String(row.id), row])).values()].sort((a, b) => a.name.localeCompare(b.name));
  return <section aria-label={mode === "history" ? "Completion History" : "Person-wise Summary"} className="min-w-0 space-y-5">
    <header><h2 className="text-lg font-semibold text-white">{mode === "history" ? "Completion History" : "Person-wise Summary"}</h2><p className="mt-2 text-xs leading-5 text-neutral-400">{mode === "history" ? "Review completed reminders and who recorded them. Period filters use completion time. Older completion facts may be unavailable." : "Due in the selected period. Completed reminders use their completion-time deadline and assignment. Pending includes In Progress; overdue is counted separately. Cancelled tasks are excluded."}</p></header>
    <div className={`${panelClass} grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4`}>
      <label className="text-xs text-neutral-400">{mode === "history" ? "Completed period" : "Due period"}<select aria-label="Planner report period" value={filters.period} onChange={event => update("period", event.target.value)} className={field}><option value="week">This week</option><option value="today">Today</option><option value="month">This month</option><option value="all">All dates</option><option value="custom">Custom range</option></select></label>
      {filters.period === "custom" && <>{["from", "to"].map(name => <label key={name} className="text-xs text-neutral-400">{name === "from" ? "From" : "To"}<input aria-label={`Report ${name}`} type="date" value={filters[name]} min="2020-01-01" max="2100-12-31" onChange={event => update(name, event.target.value)} className={field} /></label>)}</>}
      <label className="text-xs text-neutral-400">Category<select aria-label="Report category" value={filters.category} onChange={event => update("category", event.target.value)} className={field}><option value="">All categories</option>{PLANNER_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs text-neutral-400">Responsible person<select aria-label="Report responsible person" value={filters.responsible} onChange={event => update("responsible", event.target.value)} className={field}><option value="">Anyone</option><option value="unassigned">Unassigned</option>{filters.responsible && filters.responsible !== "unassigned" && !options("responsible").some(row => String(row.id) === filters.responsible) && <option value={filters.responsible}>Selected person</option>}{options("responsible").map(row => <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}</select></label>
      {mode === "history" && <label className="text-xs text-neutral-400">Marked done by<select aria-label="Report marked done by" value={filters.completedBy} onChange={event => update("completedBy", event.target.value)} className={field}><option value="">Anyone</option><option value="unrecorded">Not recorded</option>{filters.completedBy && filters.completedBy !== "unrecorded" && !options("completedBy").some(row => String(row.id) === filters.completedBy) && <option value={filters.completedBy}>Selected account</option>}{options("completedBy").map(row => <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}</select></label>}
      <label className="text-xs text-neutral-400">Search<input type="search" aria-label="Search Planner records" maxLength={100} value={searchInput} onChange={event => { setSearchInput(event.target.value); setPerson(null); }} placeholder={mode === "history" ? "Task, person or completion note…" : "Person or task name…"} className={field} /></label>
      <div className="flex flex-wrap items-end gap-2"><button type="button" disabled={loading} onClick={() => setRetry(value => value + 1)} className={button}><RefreshCw size={14} />Refresh records</button><button type="button" disabled={disabled || exporting} onClick={exportCsv} className={button}><Download size={14} />{exporting ? "Exporting…" : "Export all filtered records"}</button></div>
      {(searchInput || filters.period !== "week" || filters.category || filters.responsible || filters.completedBy) && <button type="button" className="min-h-10 text-left text-xs text-dune-amber" onClick={() => { setFilters({ period: "week", from: plannerDay(), to: plannerDay(), category: "", responsible: "", completedBy: "" }); setSearchInput(""); setSearch(""); setPage(1); setPerson(null); }}>Reset report filters</button>}
    </div>
    {loading && <p role="status" className="text-sm text-neutral-400">Loading Planner records…</p>}
    {error && <p role="alert" className="rounded-xl border border-amber-500/20 p-4 text-sm text-amber-300">{error}{data && matched ? " Last loaded records are shown and may be outdated." : ""} <button type="button" onClick={() => setRetry(value => value + 1)} className="underline">Retry Planner records</button></p>}
    {exportError && <p role="alert" className="text-sm text-amber-300">{exportError}</p>}
    {data && matched && <>
      <p className="text-xs text-neutral-400">{data.range.from ? `${data.range.from} to ${data.range.to}` : "All dates"} · Riyadh time · {data.pagination.total} matching {mode === "people" ? "people" : "completed reminders"}</p>
      <div className={`grid grid-cols-2 gap-3 ${mode === "history" ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>{(mode === "history" ? [["Completed", "completed"], ["On time", "onTime"], ["Completed late", "late"]] : [["Assigned", "assigned"], ["Completed", "completed"], ["Pending", "pending"], ["Overdue", "overdue"]]).map(([label, key]) => <div key={key} className={`${panelClass} p-4`}><p className="text-xs text-neutral-400">{label}</p><p className={`mt-2 text-2xl font-semibold ${["completed", "onTime"].includes(key) ? "text-emerald-300" : ["late", "overdue"].includes(key) ? "text-amber-300" : "text-white"}`}>{data.summary[key]}</p></div>)}</div>
      {mode === "history" && data.summary.unavailable > 0 && <p className="text-xs text-neutral-400">Timing unavailable for {data.summary.unavailable} older reminders. Completed = On time + Late + Timing unavailable.</p>}
      <div className={`${panelClass} overflow-hidden`} aria-busy={loading}>
        {mode === "history" ? <TaskRows rows={data.data} onView={onView} disabled={disabled} /> : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="border-b border-white/10 text-neutral-400"><tr>{["Responsible person", "Assigned", "Completed", "Pending", "Overdue", "Action"].map(value => <th key={value} className="px-4 py-4 font-normal">{value}</th>)}</tr></thead><tbody className="divide-y divide-white/10">{data.data.map(row => <tr key={row._id || "unassigned"}><td className="px-4 py-4 font-medium text-white">{row.name}</td>{["assigned", "completed", "pending", "overdue"].map(key => <td key={key} className={`px-4 py-4 ${key === "completed" ? "text-emerald-300" : key === "overdue" ? "text-amber-300" : "text-neutral-300"}`}>{row[key]}</td>)}<td className="px-4 py-4"><button type="button" aria-label={`View tasks for ${row.name}`} className={button} disabled={disabled} onClick={() => setPerson({ id: row._id || "unassigned", name: row.name })}>View tasks</button></td></tr>)}</tbody></table>{!data.data.length && <p className="p-8 text-center text-sm text-neutral-400">No matching reminders.</p>}</div>}
      </div>
      <Pager pagination={data.pagination} setPage={setPage} disabled={disabled} />
      {mode === "people" && person && !disabled && <PersonTasks key={JSON.stringify([filters, search, person.id])} params={params} person={person} version={version} onView={onView} />}
    </>}
    <p className="text-xs text-neutral-400">Reminder records only. This summary does not affect accounting, stock, attendance or payroll.</p>
  </section>;
}
