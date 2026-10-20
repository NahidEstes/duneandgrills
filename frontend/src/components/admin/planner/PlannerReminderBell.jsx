"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { CalendarClock, X } from "lucide-react";
import { acknowledgePlannerNotification, fetchPlannerNotifications } from "@/src/api/api.js";
import { plannerTimeLabel, plannerUpdated } from "@/src/utils/planner.js";
import PlannerSnoozeDialog from "./PlannerSnoozeDialog.jsx";

export default function PlannerReminderBell({ user, onNavigateAway }) {
  const pathname = usePathname(), router = useRouter();
  const allowed = ["admin", "manager"].includes(user?.role) && pathname?.startsWith("/admin");
  const [open, setOpen] = useState(false), [data, setData] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [snooze, setSnooze] = useState(null);
  const root = useRef(null), panel = useRef(null), trigger = useRef(null), channel = useRef(null), controller = useRef(null), writing = useRef(false);
  const [position, setPosition] = useState({ left: 16, top: 72 });
  const refresh = useCallback(() => {
    if (!allowed || document.hidden) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    fetchPlannerNotifications({ signal: request.signal }).then(value => { if (!request.signal.aborted) { setData(value); setError(""); } }).catch(error => { if (!request.signal.aborted) setError(error.response?.data?.message || "Reminders unavailable. Retry."); });
  }, [allowed]);
  useEffect(() => {
    if (!allowed) return;
    refresh(); const timer = setInterval(refresh, 60000);
    const local = () => { refresh(); channel.current?.postMessage("updated"); };
    if (typeof BroadcastChannel !== "undefined") { channel.current = new BroadcastChannel(`dg-planner-${user._id}`); channel.current.onmessage = refresh; }
    window.addEventListener("dg-planner-updated", local); document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); controller.current?.abort(); channel.current?.close(); channel.current = null; window.removeEventListener("dg-planner-updated", local); document.removeEventListener("visibilitychange", refresh); };
  }, [allowed, refresh, user?._id]);
  useEffect(() => {
    const close = event => { if (!root.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === "Escape" && !snooze) { setOpen(false); trigger.current?.focus(); } };
    const resize = () => setOpen(false);
    if (open) { panel.current?.focus(); document.addEventListener("mousedown", close); document.addEventListener("keydown", escape); window.addEventListener("resize", resize); }
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); window.removeEventListener("resize", resize); };
  }, [open, snooze]);
  const acknowledge = async (task, action, navigate = false) => {
    if (writing.current || navigate && onNavigateAway && !onNavigateAway()) return;
    writing.current = true; setBusy(true);
    try {
      await acknowledgePlannerNotification(task._id, { key: task.notificationKey, action }); plannerUpdated();
      if (navigate) { setOpen(false); router.push(`/admin/planner?task=${task._id}`); }
    } catch (error) { setError(error.response?.data?.message || "Unable to update the notification. Retry."); }
    finally { writing.current = false; setBusy(false); }
  };
  if (!allowed) return null;
  return <div ref={root} className="relative" lang="en" dir="ltr"><button ref={trigger} type="button" aria-label="Planner reminders" aria-expanded={open} aria-controls="planner-reminder-panel" title="Planner reminders" onClick={() => { const rect = trigger.current.getBoundingClientRect(), width = Math.min(340, window.innerWidth - 32); setPosition({ left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)), top: rect.bottom + 8 }); setOpen(value => !value); refresh(); }} className="relative grid h-10 w-10 place-items-center rounded-lg text-neutral-300 hover:bg-white/5 hover:text-dune-amber"><CalendarClock size={20} />{data?.unread > 0 && <span aria-label={`${data.unread} unread Planner reminders`} className="absolute -right-1 -top-0.5 min-w-4 rounded-full bg-dune-amber px-1 text-[10px] leading-4 text-black">{data.unread > 99 ? "99+" : data.unread}</span>}{error && <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-amber-500" />}</button>
    {open && createPortal(<section lang="en" dir="ltr" ref={panel} tabIndex={-1} style={position} id="planner-reminder-panel" aria-label="Planner notifications" className="fixed z-[90] max-h-[calc(100dvh-6rem)] w-[min(340px,calc(100vw-2rem))] overflow-y-auto outline-none rounded-xl border border-white/15 bg-[#101416] p-4 shadow-2xl"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-white">Planner reminders</h2><button type="button" aria-label="Close Planner reminders" onClick={() => { setOpen(false); trigger.current?.focus(); }} className="grid h-8 w-8 place-items-center text-neutral-400"><X size={16} /></button></div><p className="mt-2 text-xs leading-5 text-neutral-400">Due within 15 minutes and overdue. In-app alerts work while the Admin panel is open.</p>{error && <p role="alert" className="mt-3 text-xs text-amber-300">{error} <button onClick={refresh} type="button" className="underline">Retry</button></p>}<div className="mt-3 max-h-[55dvh] space-y-2 overflow-y-auto">{!data && !error && <p role="status" className="text-xs text-neutral-400">Loading reminders…</p>}{data?.data.map(task => <article key={task._id} className={`rounded-lg border p-3 ${task.unread ? "border-dune-amber/30" : "border-white/10"}`}><button disabled={busy} type="button" onClick={() => acknowledge(task, "read", true)} className="block w-full break-words text-left text-sm text-white">{task.title}<span className="mt-1 block text-xs text-neutral-400">{new Date(task.dueAt).toLocaleDateString("en-GB", { timeZone: "Asia/Riyadh", day: "numeric", month: "short" })} · {plannerTimeLabel(task.dueAt)} · {new Date(task.dueAt) < new Date(data.now) ? "Overdue" : task.status}</span></button><div className="mt-2 flex gap-4"><button disabled={busy} type="button" onClick={() => { setSnooze(task); setOpen(false); }} className="min-h-8 text-xs text-dune-amber">Snooze</button><button disabled={busy} type="button" onClick={() => acknowledge(task, "dismiss")} className="min-h-8 text-xs text-neutral-400">Dismiss alert</button></div></article>)}{data && !data.data.length && <p className="py-4 text-xs text-neutral-400">No actionable reminders.</p>}</div>{data?.count > 20 && <p className="mt-2 text-xs text-neutral-500">Showing 20 of {data.count}. Open Planner to review all tasks.</p>}<button type="button" onClick={() => { if (onNavigateAway && !onNavigateAway()) return; setOpen(false); router.push("/admin/planner"); }} className="mt-3 min-h-10 text-xs text-dune-amber">Open Restaurant Planner</button></section>, document.body)}
    {snooze && createPortal(<PlannerSnoozeDialog task={snooze} onClose={() => { setSnooze(null); trigger.current?.focus(); }} onSaved={refresh} />, document.body)}
  </div>;
}
