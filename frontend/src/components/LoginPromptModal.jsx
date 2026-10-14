"use client";

import React, { useRef, useState } from "react";
import { X, Lock, LoaderCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import useCustomerDialog from "../hooks/useCustomerDialog.js";

const LoginPromptModal = ({
  onClose,
  onSuccess,
  onGoRegister,
  message = "Sign in to continue with your account.",
}) => {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const { login } = useAuth();
  const dialog = useCustomerDialog(true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError("");
    setLoading(true);
    try {
      const loggedInUser = await login(form.email, form.password);
      onSuccess(loggedInUser);
    } catch (err) {
      setError(err.response?.data?.message || "Invalid email or password.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <dialog ref={dialog} aria-modal="true" aria-labelledby="customer-login-title" onCancel={event => { event.preventDefault(); if (!loading) onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-dune-border bg-dune-surface p-6 text-white backdrop:bg-black/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-dune-amber">
            <Lock className="w-4 h-4" />
            <h2 id="customer-login-title" className="font-body text-sm font-semibold uppercase tracking-wide">
              Login Required
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close sign in"
            disabled={loading}
            className="grid min-h-11 min-w-11 place-items-center text-neutral-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-white font-medium mt-4 mb-5">{message}</p>

        <form onSubmit={handleSubmit} className="space-y-3" aria-busy={loading}>
          <label htmlFor="customer-login-email" className="block text-sm text-neutral-300">Email</label>
          <input
            id="customer-login-email" name="email" autoComplete="username" aria-describedby={error ? "customer-login-error" : undefined}
            required
            disabled={loading}
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white text-sm focus:border-dune-amber outline-none"
          />
          <label htmlFor="customer-login-password" className="block text-sm text-neutral-300">Password</label>
          <input
            id="customer-login-password" name="password" autoComplete="current-password" aria-describedby={error ? "customer-login-error" : undefined}
            required
            disabled={loading}
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white text-sm focus:border-dune-amber outline-none"
          />

          {error && <p id="customer-login-error" role="alert" className="text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-dune-amber py-2.5 text-sm font-semibold text-black transition-colors hover:bg-dune-amberLight disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        <button
          type="button"
          onClick={onGoRegister}
          disabled={loading}
          className="w-full text-center text-xs text-neutral-400 hover:text-white mt-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Don&apos;t have an account?{" "}
          <span className="text-dune-amber">Sign up</span>
        </button>
    </dialog>
  );
};

export default LoginPromptModal;
