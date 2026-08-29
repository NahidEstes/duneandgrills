"use client";

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
    address: "",
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
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        await register(form);
      }
      router.push("/");
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
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <Flame className="w-6 h-6 text-dune-amber" />
          <span className="font-display text-2xl tracking-widest text-white">
            DUNE <span className="text-dune-amber">&amp;</span> GRILLS
          </span>
        </Link>

        <div className="rounded-2xl border border-dune-border bg-dune-surface p-8">
          <h1 className="text-xl font-semibold text-white mb-6">
            {mode === "login" ? "Welcome Back" : "Create an Account"}
          </h1>

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            aria-busy={loading}
          >
            {mode === "register" && (
              <input
                required
                disabled={loading}
                name="name"
                placeholder="Full Name"
                value={form.name}
                onChange={handleChange}
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white focus:border-dune-amber outline-none"
              />
            )}
            <input
              required
              disabled={loading}
              type="email"
              name="email"
              placeholder="Email"
              value={form.email}
              onChange={handleChange}
              className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white focus:border-dune-amber outline-none"
            />
            <input
              required
              disabled={loading}
              type="password"
              name="password"
              placeholder="Password"
              minLength={6}
              value={form.password}
              onChange={handleChange}
              className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white focus:border-dune-amber outline-none"
            />
            {mode === "register" && (
              <>
                <input
                  name="phone"
                  disabled={loading}
                  placeholder="Phone (optional)"
                  value={form.phone}
                  onChange={handleChange}
                  className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white focus:border-dune-amber outline-none"
                />
                <input
                  name="address"
                  disabled={loading}
                  placeholder="Address (optional)"
                  value={form.address}
                  onChange={handleChange}
                  className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white focus:border-dune-amber outline-none"
                />
              </>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-dune-amber py-3 font-semibold text-black transition-colors hover:bg-dune-amberLight disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {loading
                ? mode === "login"
                  ? "Logging in..."
                  : "Creating account..."
                : mode === "login"
                  ? "Log In"
                  : "Create Account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-400">
            {mode === "login"
              ? "Don't have an account?"
              : "Already have an account?"}{" "}
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
              className="text-dune-amber hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
