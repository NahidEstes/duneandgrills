"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Delete, Flame, LoaderCircle, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { clockInStaff, clockOutStaff, identifyStaffClock } from "@/src/api/api.js";

const formatter = new Intl.DateTimeFormat("en-SA", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Riyadh" });
const timeFormatter = new Intl.DateTimeFormat("en-SA", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Riyadh" });

export default function StaffClockPage() {
  const [pin, setPin] = useState("");
  const [session, setSession] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!result) return undefined; const timer = setTimeout(() => { setResult(null); setSession(null); setPin(""); }, 8000); return () => clearTimeout(timer); }, [result]);
  const dots = useMemo(() => Array.from({ length: 6 }, (_, index) => index < pin.length), [pin.length]);

  const addDigit = (digit) => setPin((current) => current.length < 6 ? `${current}${digit}` : current);
  const reset = () => { setPin(""); setSession(null); setResult(null); };
  const identify = async () => {
    if (pin.length < 4) return toast.error("Enter your 4–6 digit PIN.");
    setLoading(true);
    try { setSession(await identifyStaffClock(pin)); setPin(""); }
    catch (error) { toast.error(error.response?.data?.message || "Unable to verify this PIN."); setPin(""); }
    finally { setLoading(false); }
  };
  const submitAction = async () => {
    if (!session?.clockToken) return;
    setLoading(true);
    try {
      const response = session.nextAction === "clock_out" ? await clockOutStaff(session.clockToken) : await clockInStaff(session.clockToken);
      setResult({ name: response.staff.name, action: session.nextAction, at: session.nextAction === "clock_out" ? response.attendance.clockOut : response.attendance.clockIn, lateMinutes: response.attendance.lateMinutes, workedMinutes: response.attendance.totalWorkedMinutes });
      setSession(null);
    } catch (error) { toast.error(error.response?.data?.message || "Unable to record attendance."); reset(); }
    finally { setLoading(false); }
  };

  return <main className="relative min-h-screen overflow-hidden bg-[#050708] px-4 py-6 text-white sm:px-6 lg:grid lg:place-items-center lg:py-10"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(217,119,6,0.14),transparent_35%),radial-gradient(circle_at_85%_85%,rgba(146,64,14,0.18),transparent_32%)]" /><div className="pointer-events-none absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-amber-950/20 to-transparent" />
    <section className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-dune-amber/25 bg-[#0b0e10]/95 shadow-2xl shadow-black/70 lg:grid-cols-[1fr_440px]">
      <div className="hidden min-h-[700px] flex-col justify-between border-r border-white/[0.07] bg-gradient-to-br from-dune-amber/[0.08] via-transparent to-black/30 p-10 lg:flex"><div><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-dune-amber text-black"><Flame className="h-7 w-7 fill-current" /></span><div><p className="font-display text-3xl tracking-wide">DUNE <span className="text-dune-amber">&amp;</span> GRILLS</p><p className="text-[0.6rem] font-semibold tracking-[0.25em] text-dune-amber">RESTAURANT MANAGEMENT</p></div></div><h1 className="mt-20 max-w-md font-display text-6xl leading-[0.95] tracking-wide text-white">Great People.<br /><span className="text-dune-amber">Smoother Operations.</span></h1><p className="mt-6 max-w-md text-sm leading-7 text-neutral-400">Secure attendance recording for the Dune &amp; Grills team. Your PIN only works for clock actions.</p></div><div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-black/20 p-4"><ShieldCheck className="h-6 w-6 text-emerald-400" /><p className="text-xs leading-5 text-neutral-400">Server time · Asia/Riyadh<br /><span className="text-neutral-600">No admin access is granted from this screen.</span></p></div></div>

      <div className="flex min-h-[680px] flex-col p-5 sm:p-8"><header className="text-center"><div className="mx-auto flex w-fit items-center gap-2 lg:hidden"><Flame className="h-7 w-7 fill-dune-amber text-dune-amber" /><span className="font-display text-2xl tracking-wide">DUNE <span className="text-dune-amber">&amp;</span> GRILLS</span></div><p className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-dune-amber">Staff Attendance</p><h2 className="mt-2 text-3xl font-semibold">Staff Clock</h2><p className="mt-2 text-sm text-neutral-500">{formatter.format(now)}</p></header>

        <div className="flex flex-1 flex-col justify-center py-7">{result ? <div className="animate-fadeUp text-center"><span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"><CheckCircle2 className="h-10 w-10" /></span><h3 className="mt-5 text-2xl font-semibold">Welcome, {result.name}</h3><p className="mt-2 text-lg text-neutral-300">{result.action === "clock_out" ? "Clocked out" : "Clocked in"} at <span className="font-semibold text-dune-amber">{timeFormatter.format(new Date(result.at))}</span></p>{result.lateMinutes > 0 && <p className="mt-2 text-sm text-amber-300">Recorded {result.lateMinutes} minutes after the grace period.</p>}{result.action === "clock_out" && <p className="mt-2 text-sm text-neutral-500">Worked {Math.floor(result.workedMinutes / 60)}h {result.workedMinutes % 60}m</p>}<button type="button" onClick={reset} className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl border border-white/10 px-5 text-sm text-neutral-300 hover:border-dune-amber/40 hover:text-white"><ArrowLeft className="h-4 w-4" />Back to Staff Clock</button></div> : session ? <div className="text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-dune-amber/10 text-2xl font-bold text-dune-amber">{session.name?.charAt(0)?.toUpperCase()}</span><h3 className="mt-4 text-2xl font-semibold">Welcome, {session.name}</h3><p className="mt-2 text-sm text-neutral-500">Confirm the attendance action below.</p>{session.activeSince && <p className="mt-2 text-xs text-neutral-600">Active since {timeFormatter.format(new Date(session.activeSince))}</p>}<button type="button" disabled={loading} onClick={submitAction} className={`mt-8 flex h-16 w-full items-center justify-center gap-3 rounded-2xl text-lg font-bold text-white shadow-lg disabled:opacity-50 ${session.nextAction === "clock_out" ? "bg-gradient-to-r from-amber-700 to-dune-amber" : "bg-gradient-to-r from-emerald-700 to-emerald-500"}`}>{loading ? <LoaderCircle className="h-6 w-6 animate-spin" /> : session.nextAction === "clock_out" ? <LogOut className="h-6 w-6" /> : <LogIn className="h-6 w-6" />}{session.nextAction === "clock_out" ? "Clock Out" : "Clock In"}</button><button type="button" onClick={reset} className="mt-4 text-sm text-neutral-500 hover:text-white">Use another PIN</button></div> : <div><p className="text-center text-sm text-neutral-400">Enter your secure PIN to continue</p><div className="mx-auto mt-5 flex h-14 max-w-xs items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/35" aria-label={`${pin.length} PIN digits entered`}>{dots.map((filled, index) => <span key={index} className={`h-3 w-3 rounded-full transition-colors ${filled ? "bg-dune-amber shadow-[0_0_12px_rgba(217,119,6,0.6)]" : "bg-white/10"}`} />)}</div><div className="mx-auto mt-6 grid max-w-sm grid-cols-3 gap-3">{[1,2,3,4,5,6,7,8,9].map((digit) => <button key={digit} type="button" onClick={() => addDigit(digit)} className="h-16 rounded-2xl border border-white/10 bg-white/[0.035] text-xl font-semibold transition hover:border-dune-amber/40 hover:bg-dune-amber/10 active:scale-95">{digit}</button>)}<button type="button" onClick={() => setPin((current) => current.slice(0, -1))} aria-label="Delete last digit" className="grid h-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.025] text-neutral-400 hover:text-white"><Delete className="h-5 w-5" /></button><button type="button" onClick={() => addDigit(0)} className="h-16 rounded-2xl border border-white/10 bg-white/[0.035] text-xl font-semibold hover:border-dune-amber/40">0</button><button type="button" onClick={() => setPin("")} className="h-16 rounded-2xl border border-white/10 bg-white/[0.025] text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-white">Clear</button></div><button type="button" onClick={identify} disabled={loading || pin.length < 4} className="mx-auto mt-5 flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-dune-amber text-base font-bold text-black disabled:cursor-not-allowed disabled:opacity-35">{loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Clock3 className="h-5 w-5" />}Continue</button></div>}</div>
        <p className="text-center text-xs leading-5 text-neutral-700">Forgot your PIN? Ask an admin to reset your Staff Clock access.</p>
      </div>
    </section>
  </main>;
}
