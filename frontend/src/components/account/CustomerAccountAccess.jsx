"use client";
import { getLanguage, t } from "../../i18n/core.js";
import { LanguageSwitcher, useLanguage } from "../../i18n/LocaleProvider.jsx";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext.jsx";
import api from "../../api/api.js";


import { retryAfterMs } from "../../utils/refreshController.js";

export function EmailVerificationNotice({ showStatus = false }) {
  useLanguage();const { user } = useAuth();
  if (user?.role !== "customer") return null;
  if (user.emailVerifiedAt) return showStatus ? <p className="mb-3 text-sm text-emerald-200">{t("Email verified")}</p> : null;
  if (!user.emailVerificationRequired) return showStatus ? <p className="mb-3 text-sm text-neutral-300">{t("Email verification is optional for existing accounts.")} <Link href="/resend-verification" className="inline-block min-h-11 py-2 text-dune-amber underline">{t("Verify email")}</Link></p> : null;
  return <aside className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-100"><p>{t("Verify your email before placing an account order. Your cart has been kept.")}</p><Link href="/verification-pending" className="mt-2 inline-block min-h-11 py-2 underline">{t("Verify email / request a new link")}</Link></aside>;
}
export default function CustomerAccountAccess({ mode }) {
  useLanguage();
  const { user, setUser, endCustomerSession } = useAuth();
  const [email, setEmail] = useState(""),[password, setPassword] = useState(""),[confirmation, setConfirmation] = useState("");
  const [token, setToken] = useState(""),[configured, setConfigured] = useState(null),[error, setError] = useState(""),[notice, setNotice] = useState(""),[done, setDone] = useState(false),[busy, setBusy] = useState(false),[cooldown, setCooldown] = useState(0);
  const lock = useRef(false),deadline = useRef(0);
  const linkMode = mode === "reset" || mode === "verify",verifyRequest = mode === "pending" || mode === "resend";
  useEffect(() => {
    // Fragments are never sent to the server/referrer. Remove even the fragment
    // immediately; never automatically consume links (including email scanners).
    const readLink = () => { if (!linkMode) return; setToken(new URLSearchParams(window.location.hash.slice(1)).get("token") || ""); setDone(false); setError(""); setNotice(""); setPassword(""); setConfirmation(""); history.replaceState(history.state, "", window.location.pathname); };
    readLink(); window.addEventListener("hashchange", readLink);
    const controller = new AbortController();api.get("/auth/email-availability", { signal: controller.signal }).then((response) => setConfigured(response.data.data.configured === true)).catch(() => {if (!controller.signal.aborted) setConfigured(false);});
    return () => { controller.abort(); window.removeEventListener("hashchange", readLink); };
  }, [linkMode, mode]);
  useEffect(() => {if (user?.role === "customer") setEmail((current) => current || user.email);}, [user]);
  useEffect(() => {const timer = setInterval(() => setCooldown(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))), 1000);return () => clearInterval(timer);}, []);
  const submit = async (event) => {
    event.preventDefault();if (lock.current || Date.now() < deadline.current) return;
    lock.current = true;setBusy(true);setError("");setNotice("");
    try {
      if (mode === "reset" && password !== confirmation) {setError("Passwords do not match.");return;}
      const endpoint = mode === "reset" ? "reset-password" : mode === "verify" ? "verify-email" : verifyRequest ? "resend-verification" : "forgot-password";
      const payload = linkMode ? mode === "reset" ? { token, password, confirmPassword: confirmation } : { token } : { email, language: getLanguage() };
      const response = await api.post(`/auth/${endpoint}`, payload);
      if (linkMode) {setDone(true);setToken("");if (mode === "reset") endCustomerSession();else if (user?.role === "customer") {try {const session = await api.get("/auth/me");setUser(session.data.user);} catch {/* The account page restores the session; never mark a different signed-in account verified. */}}} else
      {deadline.current = Date.now() + (response.data.retryAfterSeconds || 60) * 1000;setCooldown(Math.ceil((deadline.current - Date.now()) / 1000));}
      setNotice(response.data.message || "If this customer account is eligible, an email request has been queued. This does not confirm delivery. Check your inbox; request another link if none arrives.");
    } catch (failure) {
      if (failure.response?.status === 429) {deadline.current = Date.now() + Math.max(1000, retryAfterMs(failure.response.headers));setCooldown(Math.ceil((deadline.current - Date.now()) / 1000));}
      setError(failure.response?.status === 429 ? "Too many requests. Please wait before requesting another link." : failure.response?.data?.message || "Account service is unavailable. Please retry.");
    } finally {lock.current = false;setBusy(false);}
  };
  const title = mode === "reset" ? "Reset password" : mode === "verify" ? "Verify email" : verifyRequest ? "Email verification pending" : "Forgot password?";
  return <main className="min-h-dvh bg-[#090d0f] px-4 py-8 text-white"><div className="mx-auto max-w-md"><header className="mb-8 flex items-center justify-between gap-3"><Link href="/" className="font-bold" dir="ltr">DUNE &amp; GRILLS</Link><LanguageSwitcher /></header><section className="rounded-2xl border border-white/15 bg-[#14191b] p-6 sm:p-8"><h1 className="text-3xl font-semibold">{t(title)}</h1>
    {verifyRequest && <p className="mt-4 text-sm leading-7 text-neutral-300">{t("Your account is available. Verify your email to place account orders. Existing customer accounts are not blocked by this update.")}</p>}
    {!linkMode && configured === false && <p role="alert" className="mt-5 rounded-lg border border-amber-400/40 p-4 text-sm text-amber-100">{t("Account email is currently unavailable. Contact the restaurant or try again later.")}</p>}
    {!linkMode && configured === null && <p role="status" className="mt-4">{t("Checking email availability…")}</p>}
    {linkMode && !token && !done && <p role="alert" className="mt-4 text-amber-200">{t("This link is invalid, expired or already used. Request a new link.")}</p>}
    {!done && <form onSubmit={submit} className="mt-6 space-y-5" aria-busy={busy}>
      {!linkMode && <label className="block text-sm">{t("Email")}<input type="email" dir="ltr" required autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-white/20 bg-black p-3" /></label>}
      {mode === "reset" && <><label className="block text-sm">{t("New password")}<input type="password" dir="ltr" autoComplete="new-password" required minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-white/20 bg-black p-3" /></label><label className="block text-sm">{t("Confirm new password")}<input type="password" dir="ltr" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-white/20 bg-black p-3" /></label><p className="text-xs leading-6 text-neutral-400">{t("Password must be at least 10 characters and include uppercase, lowercase, number and symbol")}</p></>}
      <button disabled={busy || cooldown > 0 || (linkMode ? !token : configured !== true)} className="min-h-12 w-full rounded-lg bg-dune-amber p-3 font-semibold text-black disabled:opacity-45">{t(busy ? "Working…" : mode === "reset" ? "Reset password" : mode === "verify" ? "Confirm email verification" : verifyRequest ? "Request verification email" : "Request password reset")}</button>
      {cooldown > 0 && <p role="status" className="text-sm text-amber-200">{t("Try again in {0} seconds", [new Intl.NumberFormat(getLanguage() === "ar" ? "ar-SA" : "en-GB").format(cooldown)])}</p>}
    </form>}
    {error && <p role="alert" className="mt-5 text-sm leading-7 text-red-200">{t(error)}</p>}{notice && <p role="status" className="mt-5 text-sm leading-7 text-emerald-200">{t(notice)}</p>}
    {linkMode && (!token || error) && <Link className="mt-5 block min-h-11 py-2 text-dune-amber underline" href={mode === "reset" ? "/forgot-password" : "/resend-verification"}>{t("Request a new link")}</Link>}
    <Link href={mode === "verify" && done && user ? "/profile" : "/login"} className="mt-5 block min-h-11 py-2 text-neutral-300 underline">{t(mode === "verify" && done && user ? "Back to account" : "Back to sign in")}</Link><Link href="/menu" className="mt-2 block min-h-11 py-2 text-dune-amber">{t("Explore menu")}</Link>
  </section><div id="public-app-options" className="mt-6 flex justify-center" /></div></main>;
}
