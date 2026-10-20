"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CalendarDays, Check, CircleCheck, Clock3, List, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { changePlannerSchedule, deletePlannerReminder, fetchPlanner, fetchPlannerReferences, fetchPlannerTask, undoPlannerReminder, updatePlannerProgress } from "@/src/api/api.js";
import { PLANNER_CATEGORIES, addPlannerDays, plannerCalendar, plannerDateLabel, plannerDay, plannerMonth, plannerOverdue, plannerRepeatLabel, plannerTimeLabel, plannerUpdated, plannerWeek } from "@/src/utils/planner.js";
import AdminShell from "../AdminShell.jsx";
import { inputClass, panelClass } from "../staff/staffUi.jsx";
import PlannerCalendar from "./PlannerCalendar.jsx";
import PlannerWeek from "./PlannerWeek.jsx";
import PlannerTaskForm from "./PlannerTaskForm.jsx";
import PlannerSnoozeDialog from "./PlannerSnoozeDialog.jsx";

const filters = [["today", "Today"], ["upcoming", "Upcoming"], ["overdue", "Overdue"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["all", "All Tasks"]];
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-neutral-300 transition-colors hover:border-dune-amber/50 disabled:opacity-40";
function TaskStatus({ task, now }) {
  return <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-[11px] ${task.status === "Done" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : task.status === "In Progress" ? "border-dune-amber/40 bg-dune-amber/5 text-dune-amber" : task.status === "Cancelled" ? "border-white/10 text-neutral-400" : "border-white/15 text-neutral-400"}`}>{task.status}{plannerOverdue(task, now) ? " · Overdue" : ""}</span>;
}
function TaskDetails({ task }) {
  return <div className="mt-1.5 space-y-1 text-[11px] text-neutral-400"><p>{task.responsible?.name || "Unassigned"}</p><p>{task.checklist?.length ? `Checklist ${task.checklist.filter(row => row.done).length}/${task.checklist.length} · ` : ""}{plannerRepeatLabel(task)}</p>{task.series?.paused && <p className="text-amber-300">Schedule paused</p>}{task.snoozedUntil && <p>Snoozed until {new Date(task.snoozedUntil).toLocaleString("en-GB", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>}</div>;
}
export default function PlannerPage() {
  const router = useRouter(), searchParams = useSearchParams(), taskId = searchParams.get("task"), { user, logout } = useAuth();
  const [view, setView] = useState("list"), [filter, setFilter] = useState("today"), [page, setPage] = useState(1);
  const [month, setMonth] = useState(() => plannerMonth(plannerDay())), [week, setWeek] = useState(() => plannerWeek(plannerDay())), [selectedDay, setSelectedDay] = useState(() => plannerDay());
  const [searchInput, setSearchInput] = useState(""), [search, setSearch] = useState(""), [options, setOptions] = useState({ category: "", priority: "", responsible: "", sort: "" });
  const [staff, setStaff] = useState([]), [staffSearch, setStaffSearch] = useState(""), [staffError, setStaffError] = useState(false), [staffVersion, setStaffVersion] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [data, setData] = useState(null), [loadedKey, setLoadedKey] = useState(""), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [error, setError] = useState("");
  const [editing, setEditing] = useState(null), [snooze, setSnooze] = useState(null), [loadingTask, setLoadingTask] = useState(false), [busy, setBusy] = useState(""), [version, setVersion] = useState(0), [notice, setNotice] = useState(""), [undo, setUndo] = useState(null);
  const lock = useRef(false), editVersion = useRef(0);
  const cells = plannerCalendar(month), rangeFrom = view === "week" ? week : cells[0], from = rangeFrom < "2020-01-01" ? "2020-01-01" : rangeFrom, to = view === "week" ? addPlannerDays(week, 6) : cells.at(-1);
  const params = useMemo(() => ({ view, filter, page, search, ...options, ...(view !== "list" ? { from, to } : {}) }), [view, filter, page, search, options, from, to]);
  const requestKey = JSON.stringify(params), matched = loadedKey === requestKey;
  const readOnly = loading || !matched || !!loadError;
  const refresh = () => setVersion(value => value + 1);
  useEffect(() => { const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [searchInput]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setLoadError("");
    fetchPlanner(params, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setData(value); setLoadedKey(JSON.stringify(params)); } }).catch(error => {
      if (controller.signal.aborted) return;
      setLoadError(error.response?.data?.message || "Unable to load Planner. Please retry.");
      if ([401, 403].includes(error.response?.status)) { setData(null); setLoadedKey(""); setEditing(null); setSnooze(null); setUndo(null); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [params, version]);
  useEffect(() => {
    const controller = new AbortController(); const timer = setTimeout(() => {
      fetchPlannerReferences("staff", staffSearch, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setStaff(value); setStaffError(false); } }).catch(() => { if (!controller.signal.aborted) setStaffError(true); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [staffSearch, staffVersion]);
  useEffect(() => {
    const refreshVisible = () => { if (!document.hidden) setVersion(value => value + 1); };
    const timer = setInterval(refreshVisible, 60000); document.addEventListener("visibilitychange", refreshVisible); window.addEventListener("dg-planner-updated", refreshVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refreshVisible); window.removeEventListener("dg-planner-updated", refreshVisible); };
  }, []);
  useEffect(() => {
    setEditing(null); setLoadingTask(!!taskId);
    if (!taskId) return;
    let cancelled = false; const request = ++editVersion.current; setLoadingTask(true);
    fetchPlannerTask(taskId).then(value => { if (!cancelled && request === editVersion.current) setEditing({ task: value }); }).catch(error => { if (!cancelled && request === editVersion.current) setError(error.response?.data?.message || "Unable to open the reminder."); }).finally(() => { if (!cancelled && request === editVersion.current) setLoadingTask(false); });
    return () => { cancelled = true; };
  }, [taskId]);
  useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(null), Math.max(0, new Date(undo.expiresAt) - Date.now())); return () => clearTimeout(timer); }, [undo]);
  useEffect(() => { if (!loading && matched && data && page > Math.max(1, data.pagination.pages)) setPage(Math.max(1, data.pagination.pages)); }, [loading, matched, data, page]);
  const today = data?.today || plannerDay();
  const chooseFilter = (value, list = false) => { setFilter(value); setPage(1); if (list) setView("list"); };
  const chooseView = value => { setView(value); setPage(1); if (value !== "list") setFilter("all"); };
  const updateOption = (key, value) => { setOptions(current => ({ ...current, [key]: value })); setPage(1); };
  const changed = () => { setError(""); refresh(); plannerUpdated(); };
  const closeEdit = () => { editVersion.current++; setLoadingTask(false); setEditing(null); if (taskId) router.replace("/admin/planner", { scroll: false }); };
  const edit = async task => {
    const request = ++editVersion.current; setLoadingTask(true); setError("");
    try { const value = await fetchPlannerTask(task._id); if (request === editVersion.current) setEditing({ task: value }); }
    catch (error) { if (request === editVersion.current) setError(error.response?.data?.message || "Unable to open this reminder. Refresh and retry."); }
    finally { if (request === editVersion.current) setLoadingTask(false); }
  };
  const change = async (task, status, remove = false) => {
    if (lock.current) return;
    if (remove && !window.confirm(`Delete reminder “${task.title}”? Only this occurrence will be removed. Business records will not change.`)) return;
    lock.current = true; setBusy(task._id); setError(""); setNotice(""); setUndo(null);
    try {
      if (remove) await deletePlannerReminder(task._id, task.revision);
      else { const result = await updatePlannerProgress(task._id, { revision: task.revision, status }); if (result.data.undo) setUndo({ ...result.data.undo, id: task._id }); }
      setNotice(remove ? "Reminder deleted." : `Reminder marked ${status}.`); changed();
    } catch (error) { setError(error.response?.data?.message || "Unable to update. Refresh to check the reminder's status."); }
    finally { lock.current = false; setBusy(""); }
  };
  const undoChange = async () => {
    if (lock.current || !undo) return;
    lock.current = true; setBusy(undo.id);
    try { await undoPlannerReminder(undo.id, { revision: undo.revision, token: undo.token }); setUndo(null); setNotice("Previous reminder status restored."); changed(); }
    catch (error) { setUndo(null); setError(error.response?.data?.message || "Unable to undo. Refresh to check its status."); }
    finally { lock.current = false; setBusy(""); }
  };
  const schedule = async task => {
    if (lock.current || !window.confirm(`${task.series.paused ? "Resume" : "Pause"} this repeating schedule? Existing reminders and history stay visible. Unsaved form changes will not be saved.`)) return;
    lock.current = true; setBusy(task._id);
    try { await changePlannerSchedule(task._id, { revision: task.series.revision, paused: !task.series.paused }); closeEdit(); setUndo(null); setNotice(task.series.paused ? "Schedule resumed. Earlier alerts stay suppressed." : "Schedule paused. Existing reminders are kept."); changed(); }
    finally { lock.current = false; setBusy(""); }
  };
  const actions = task => <div className="flex flex-wrap items-center gap-1"><button type="button" aria-label={`Edit ${task.title}`} disabled={!!busy || loadingTask || loading} onClick={() => edit(task)} className="grid h-10 w-10 place-items-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-dune-amber"><Pencil size={15} /></button>{["Pending", "In Progress"].includes(task.status) && <><button type="button" disabled={!!busy || loading} aria-label={`Snooze ${task.title}`} onClick={() => setSnooze(task)} className="grid h-10 w-10 place-items-center rounded-lg text-neutral-400 hover:text-dune-amber"><Clock3 size={15} /></button><button type="button" disabled={!!busy || loading} aria-label={`Cancel ${task.title}`} onClick={() => change(task, "Cancelled")} className="grid h-10 w-10 place-items-center rounded-lg text-neutral-400 hover:text-dune-amber"><X size={15} /></button></>}<button type="button" disabled={!!busy || loading} aria-label={`Delete ${task.title}`} onClick={() => change(task, null, true)} className="grid h-10 w-10 place-items-center rounded-lg text-neutral-400 hover:text-red-300"><Trash2 size={15} /></button></div>;
  const complete = task => <button type="button" disabled={!!busy || loading} onClick={() => change(task, task.status === "Done" ? "Pending" : "Done")} aria-label={`${task.status === "Done" ? "Reopen" : "Complete"} ${task.title}`} className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${task.status === "Done" ? "border-emerald-500 bg-emerald-400 text-black" : "border-white/30 text-neutral-400"}`}>{task.status === "Done" && <Check size={16} />}</button>;
  const hasFilters = searchInput || options.category || options.priority || options.responsible || options.sort;
  return <AdminShell activeTab="planner" onTabChange={tab => { router.push(`/admin?tab=${tab}`); return true; }} title="" subtitle="" user={user} onLogout={logout} showGlobalSearch={false} showOrderControls={false} showPageHeading={false}>
    <div lang="en" dir="ltr" className="min-w-0 space-y-6">
      <header><h1 className="font-body text-2xl font-semibold tracking-tight text-white sm:text-3xl">Restaurant Planner</h1><p className="mt-2 text-sm text-neutral-400">Plan daily work and keep track of upcoming tasks.</p></header>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-base font-semibold text-white">{plannerDateLabel(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p><p className="mt-1 text-xs text-neutral-400">Riyadh time · Reminders only</p></div><div className="flex gap-2"><button type="button" onClick={refresh} disabled={loading} aria-label="Refresh Planner" className={button}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /><span className="hidden sm:inline">Refresh</span></button><button type="button" disabled={loadingTask} onClick={() => { editVersion.current++; setEditing({ task: null, dueDate: view === "calendar" ? selectedDay : view === "week" && (today < from || today > to) ? from : today }); setNotice(""); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-dune-amber px-5 text-sm font-semibold text-black"><Plus size={18} />Add task</button></div></div>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">{[["pending_today", "today", "Pending Today", CalendarDays, "text-dune-amber", "bg-dune-amber/10"], ["overdue", "overdue", "Overdue", AlertCircle, "text-red-400", "bg-red-500/10"], ["completed_today", "completedToday", "Completed Today", CircleCheck, "text-emerald-400", "bg-emerald-500/10"]].map(([key, count, label, Icon, color, bg]) => <button type="button" key={key} onClick={() => chooseFilter(key, true)} className={`${panelClass} flex min-w-0 items-center gap-3 p-3 text-left sm:p-5`} aria-label={`${label} reminders: ${data?.summary[count] ?? "loading"}`}><span className={`hidden rounded-xl p-3 sm:block ${color} ${bg}`}><Icon size={24} /></span><span className="min-w-0"><span className="block text-[11px] text-neutral-400 sm:text-xs">{label}</span><strong className="mt-1 block text-2xl font-semibold text-white sm:text-3xl">{data?.summary[count] ?? "—"}</strong></span></button>)}</div>
      <section aria-label="Search and filter reminders" className={`${panelClass} space-y-3 p-4`}><label className="block text-xs text-neutral-400">Search reminders<input type="search" aria-label="Search reminders" maxLength={100} value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search title, notes, checklist or linked record…" className={`${inputClass} mt-2 h-10 rounded-lg`} /></label><button type="button" aria-expanded={filtersOpen} aria-controls="planner-filter-options" onClick={() => setFiltersOpen(value => !value)} className={button + " sm:hidden"}>Filters{options.category || options.priority || options.responsible || options.sort ? " · Active" : ""}</button><div id="planner-filter-options" className={`${filtersOpen ? "grid" : "hidden sm:grid"} gap-3 sm:grid-cols-2 xl:grid-cols-4`}><label className="text-xs text-neutral-400">Category<select aria-label="Filter category" value={options.category} onChange={event => updateOption("category", event.target.value)} className={`${inputClass} mt-2 h-10 rounded-lg [color-scheme:dark]`}><option value="">All categories</option>{PLANNER_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label><label className="text-xs text-neutral-400">Priority<select aria-label="Filter priority" value={options.priority} onChange={event => updateOption("priority", event.target.value)} className={`${inputClass} mt-2 h-10 rounded-lg [color-scheme:dark]`}><option value="">All priorities</option><option>Normal</option><option>High</option></select></label><div><label className="text-xs text-neutral-400">Responsible person<select aria-label="Filter responsible person" value={options.responsible} onChange={event => updateOption("responsible", event.target.value)} className={`${inputClass} mt-2 h-10 rounded-lg [color-scheme:dark]`}><option value="">Anyone</option><option value="unassigned">Unassigned</option>{options.responsible && options.responsible !== "unassigned" && !staff.some(row => row.id === options.responsible) && <option value={options.responsible}>Selected person</option>}{staff.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label><input type="search" aria-label="Search responsible person filter" value={staffSearch} onChange={event => setStaffSearch(event.target.value)} placeholder="Find staff by name or ID…" className={`${inputClass} mt-2 h-8 rounded-lg text-xs`} />{staffError && <p className="mt-1 text-xs text-amber-300">Staff options unavailable. <button type="button" onClick={() => setStaffVersion(value => value + 1)} className="underline">Retry staff options</button></p>}</div><label className="text-xs text-neutral-400">Sort<select aria-label="Sort reminders" value={options.sort} onChange={event => updateOption("sort", event.target.value)} className={`${inputClass} mt-2 h-10 rounded-lg [color-scheme:dark]`}><option value="">Default order</option><option value="due_asc">Due: earliest first</option><option value="due_desc">Due: latest first</option><option value="priority">High priority first</option><option value="completed">Recently completed</option></select></label></div><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-neutral-400">Filters apply to tasks, calendar and summary counts. {loadError ? "Reminder list unavailable. Refresh to check the latest tasks." : loading || !matched ? "Updating…" : `${data?.pagination.total ?? 0} matching reminders.`}</p>{hasFilters && <button type="button" className="min-h-9 text-xs text-dune-amber" onClick={() => { setSearchInput(""); setSearch(""); setStaffSearch(""); setOptions({ category: "", priority: "", responsible: "", sort: "" }); setPage(1); }}>Clear filters</button>}</div></section>
      <div className="flex flex-wrap items-center justify-between gap-4"><nav aria-label="Planner filters" className="flex flex-wrap gap-2">{filters.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => chooseFilter(value)} className={`${button} ${filter === value ? "border-dune-amber/70 bg-dune-amber/5 text-dune-amber" : ""}`}>{label}</button>)}{["pending_today", "completed_today"].includes(filter) && <span className="self-center text-xs text-dune-amber">{filter === "pending_today" ? "Pending Today" : "Completed Today"}</span>}</nav><div className="inline-flex rounded-lg border border-white/10" aria-label="Planner view">{[["list", "List", List], ["week", "Week", CalendarDays], ["calendar", "Calendar", CalendarDays]].map(([value, label, Icon]) => <button type="button" key={value} aria-pressed={view === value} onClick={() => chooseView(value)} className={`${button} border-transparent ${view === value ? "border-dune-amber/60 bg-dune-amber/5 text-dune-amber" : ""}`}><Icon size={16} />{label}</button>)}</div></div>
      {notice && <div role="status" className="flex flex-wrap items-center gap-3 text-sm text-emerald-300">{notice}{undo && <button type="button" disabled={!!busy} onClick={undoChange} className="min-h-10 rounded-lg border border-emerald-500/30 px-4 text-sm text-emerald-200">Undo</button>}</div>}{(loadError || error) && <p role="alert" className="rounded-xl border border-amber-500/20 p-4 text-sm text-amber-300">{[loadError, error].filter(Boolean).join(" " )}{loadError && data && matched ? " Last loaded reminders are shown; refresh before changing them." : ""} <button type="button" onClick={() => { setError(""); refresh(); }} className="ml-2 underline">Retry Planner</button></p>}{loadingTask && <p role="status" className="text-sm text-neutral-400">Loading reminder…</p>}
      {(!data || !matched) && loading ? <div role="status" className={`${panelClass} p-10 text-center text-sm text-neutral-400`}>Loading reminders…</div> : data && matched && <fieldset disabled={readOnly} className="min-w-0 space-y-6">
        {view !== "list" ? <>{view === "week" ? <PlannerWeek data={data} week={week} setWeek={setWeek} today={today} onEdit={edit} /> : <PlannerCalendar data={data} month={month} setMonth={setMonth} selectedDay={selectedDay} setSelectedDay={setSelectedDay} today={today} onEdit={edit} />}{data.pagination.truncated && <p role="alert" className="text-sm text-amber-300">More than 1,000 reminders match this range. Use search, filters or List view to review more.</p>}</> : <>
          <section aria-label="Planner task list" aria-busy={loading} className={`${panelClass} overflow-hidden`}><div className="divide-y divide-white/[0.07] sm:hidden">{data.data.map(task => <article key={task._id} className="space-y-3 p-4"><div className="flex items-start gap-3">{complete(task)}<div className="min-w-0 flex-1"><button type="button" disabled={loadingTask} onClick={() => edit(task)} className="break-words text-left text-sm font-medium text-white">{task.title}</button><TaskDetails task={task} /></div><span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] ${task.priority === "High" ? "border-red-500/30 text-red-300" : "border-white/15 text-neutral-400"}`}>{task.priority}</span></div><p className="text-xs text-neutral-400">{task.category} · {plannerDateLabel(task.dueDate)} · {plannerTimeLabel(task.dueAt)}</p><div className="flex flex-wrap items-center justify-between gap-2"><TaskStatus task={task} now={data.now} />{actions(task)}</div></article>)}</div><div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-white/[0.07] text-xs text-neutral-400"><tr>{["Task", "Category", "Due", "Priority", "Status", "Actions"].map(label => <th key={label} className="px-4 py-4 font-normal">{label}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.07]">{data.data.map(task => <tr key={task._id} className="hover:bg-white/[0.02]"><td className="px-4 py-4"><div className="flex items-start gap-3">{complete(task)}<div className="min-w-0"><button type="button" disabled={loadingTask} onClick={() => edit(task)} className="max-w-xs break-words text-left font-medium text-white hover:text-dune-amber">{task.title}</button><TaskDetails task={task} /></div></div></td><td className="px-4 py-4 text-xs text-neutral-400">{task.category}</td><td className="px-4 py-4 text-xs text-neutral-400"><span className="mb-1 block whitespace-nowrap">{plannerDateLabel(task.dueDate)}</span><span className="whitespace-nowrap">{plannerTimeLabel(task.dueAt)}</span></td><td className="px-4 py-4"><span className={`rounded-md border px-2 py-1 text-[11px] ${task.priority === "High" ? "border-red-500/30 bg-red-500/5 text-red-300" : "border-white/15 text-neutral-400"}`}>{task.priority}</span></td><td className="px-4 py-4"><TaskStatus task={task} now={data.now} /></td><td className="px-4 py-4">{actions(task)}</td></tr>)}</tbody></table></div>{!data.data.length && <p className="px-4 py-12 text-center text-sm text-neutral-400">No matching reminders. Adjust the filters or add a task.</p>}</section>
          {data.pagination.pages > 1 && <div className="flex items-center gap-3 text-sm text-neutral-400"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)} className={button}>Previous</button><span>Page {page} of {data.pagination.pages}</span><button type="button" disabled={page >= data.pagination.pages || loading} onClick={() => setPage(value => value + 1)} className={button}>Next</button></div>}
          <section className={`${panelClass} p-5`}><h2 className="font-body text-sm font-semibold text-white">Coming up</h2><div className="mt-3 grid gap-3 md:grid-cols-3">{data.comingUp.map(task => <button type="button" key={task._id} onClick={() => edit(task)} className="flex min-w-0 gap-3 rounded-lg p-2 text-left hover:bg-white/[0.03]"><Clock3 size={18} className="mt-1 shrink-0 text-neutral-400" /><span className="min-w-0"><span className="block text-xs text-neutral-400">{plannerDateLabel(task.dueDate)} · {plannerTimeLabel(task.dueAt)}</span><span className="mt-1 block break-words text-sm text-white">{task.title}</span></span></button>)}{!data.comingUp.length && <p className="text-sm text-neutral-400">No upcoming reminders.</p>}</div></section>
        </>}
      </fieldset>}
      <p className="text-xs leading-5 text-neutral-400">Planner tracks reminders only. Payments, expenses, stock and other business records are managed separately.</p>
      {editing && <PlannerTaskForm key={editing.task?._id || "new"} task={editing.task} initialDate={editing.dueDate} onClose={closeEdit} onSchedule={schedule} onSaved={() => { closeEdit(); setUndo(null); setNotice("Reminder saved."); changed(); }} />}
      {snooze && <PlannerSnoozeDialog task={snooze} onClose={() => setSnooze(null)} onSaved={() => { setUndo(null); setNotice("Reminder alert updated. Original deadline kept."); changed(); }} />}
    </div>
  </AdminShell>;
}
