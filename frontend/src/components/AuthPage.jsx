"use client";
import { t, getLanguage } from "../i18n/core.js";
import { LanguageSwitcher, withLocale } from "../i18n/LocaleProvider.jsx";


import React, { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flame, LoaderCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";



const AuthPage = () => {
  const [mode, setMode] = useState("login"); // login | register
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    address: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const { login, register } = useAuth();
  const router = useRouter();

  const handleChange = (e) =>
  setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError("");
    setLoading(true);
    try {
      let authenticatedUser;
      if (mode === "login") {
        authenticatedUser = await login(form.email, form.password);
      } else {
        authenticatedUser = await register({ ...form, language: getLanguage() });
      }
      const destination = new URLSearchParams(window.location.search).get("returnTo");
      const safe = destination && destination.startsWith("/") && !destination.startsWith("//") && !destination.includes("\\") && !/[\r\n]/.test(destination);
      router.push(authenticatedUser?.role === "customer" && authenticatedUser.emailVerificationRequired && !authenticatedUser.emailVerifiedAt ? "/verification-pending" : safe ? destination : authenticatedUser?.role === "rider" ? "/rider" : authenticatedUser?.role === "kitchen" ? "/kitchen" : "/");
    } catch (err) {
      setError(
        err.response?.data?.message || "Something went wrong. Please try again."
      );
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-black flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-end"><LanguageSwitcher /></div>
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <Flame className="w-6 h-6 text-dune-amber" />
          <span className="font-display text-2xl tracking-widest text-white">{t(" DUNE ")}
            <span className="text-dune-amber">{t("&")}</span>{t(" GRILLS ")}
          </span>
        </Link>

        <div className="rounded-2xl border border-dune-border bg-dune-surface p-8">
          <h1 className="text-xl font-semibold text-white mb-6">
            {t(mode === "login" ? "Welcome Back" : "Create an Account")}
          </h1>

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            aria-busy={loading}>

            {mode === "register" && <>
              <label htmlFor="auth-name" className="block text-sm text-neutral-300">{t("Full name")}</label>
              <input
                id="auth-name" autoComplete="name" aria-describedby={error ? "auth-error" : undefined}
                required
                disabled={loading}
                name="name"
                placeholder={t("Full Name")}
                value={form.name}
                onChange={handleChange}
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white focus:border-dune-amber outline-none" />
            </>
            }
            <label htmlFor="auth-email" className="block text-sm text-neutral-300">{t("Email")}</label>
            <input
              id="auth-email" autoComplete={mode === "login" ? "username" : "email"} aria-describedby={error ? "auth-error" : undefined}
              required
              disabled={loading}
              type="email"
              name="email"
              placeholder={t("Email")}
              value={form.email}
              onChange={handleChange}
              className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white focus:border-dune-amber outline-none" />

            <label htmlFor="auth-password" className="block text-sm text-neutral-300">{t("Password")}</label>
            <input
              id="auth-password" autoComplete={mode === "login" ? "current-password" : "new-password"} aria-describedby={error ? "auth-error" : undefined}
              required
              disabled={loading}
              type="password"
              name="password"
              placeholder={t("Password")}
              minLength={mode === "register" ? 10 : 1}
              value={form.password}
              onChange={handleChange}
              className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white focus:border-dune-amber outline-none" />

            {mode === "register" &&
            <>
                <label htmlFor="auth-phone" className="block text-sm text-neutral-300">{t("Phone (optional)")}</label>
                <input
                id="auth-phone" type="tel" autoComplete="tel" aria-describedby={error ? "auth-error" : undefined}
                name="phone"
                disabled={loading}
                placeholder={t("Phone (optional)")}
                value={form.phone}
                onChange={handleChange}
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white focus:border-dune-amber outline-none" />

                <label htmlFor="auth-address" className="block text-sm text-neutral-300">{t("Address (optional)")}</label>
                <input
                id="auth-address" autoComplete="street-address" aria-describedby={error ? "auth-error" : undefined}
                name="address"
                disabled={loading}
                placeholder={t("Address (optional)")}
                value={form.address}
                onChange={handleChange}
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white focus:border-dune-amber outline-none" />

              </>
            }

            {error && <p id="auth-error" role="alert" className="text-sm text-red-300">{t(error)}</p>}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-dune-amber py-3 font-semibold text-black transition-colors hover:bg-dune-amberLight disabled:cursor-not-allowed disabled:opacity-60">

              {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {t(loading ?
              mode === "login" ?
              "Logging in..." :
              "Creating account..." :
              mode === "login" ?
              "Log In" :
              "Create Account")}
            </button>
          </form>
          {mode === "register" && <p className="mt-3 text-xs text-neutral-400">{t("Password must be at least 10 characters and include uppercase, lowercase, number and symbol")}</p>}
          {mode === "login" && <Link className="mt-4 inline-block min-h-11 py-2 text-sm text-dune-amber" href="/forgot-password">{t("Forgot password?")}</Link>}

          <p className="mt-6 text-center text-sm text-neutral-400">
            {t(mode === "login" ?
            "Don't have an account?" :
            "Already have an account?")}{" "}
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
              className="text-dune-amber hover:underline disabled:cursor-not-allowed disabled:opacity-50">

              {t(mode === "login" ? "Sign up" : "Log in")}
            </button>
          </p>
        </div>
        <div id="public-app-options" className="mt-6 flex justify-center" />
      </div>
    </div>);

};

export default withLocale(AuthPage);
