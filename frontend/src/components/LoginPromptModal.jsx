"use client";

import React, { useRef, useState } from "react";
import { X, Lock, LoaderCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

const LoginPromptModal = ({
  onClose,
  onSuccess,
  onGoRegister,
  message = "অর্ডার করতে প্রথমে লগইন করুন",
}) => {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const { login } = useAuth();

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
    <div
      onClick={loading ? undefined : onClose}
      className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-dune-border bg-dune-surface p-6 animate-fadeUp"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-dune-amber">
            <Lock className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Login Required
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-neutral-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-white font-medium mt-4 mb-5">{message}</p>

        <form onSubmit={handleSubmit} className="space-y-3" aria-busy={loading}>
          <input
            required
            disabled={loading}
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white text-sm focus:border-dune-amber outline-none"
          />
          <input
            required
            disabled={loading}
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white text-sm focus:border-dune-amber outline-none"
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

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
      </div>
    </div>
  );
};

export default LoginPromptModal;
