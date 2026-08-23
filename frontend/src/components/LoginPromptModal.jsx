import React, { useState } from "react";
import { X, Lock } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

const LoginPromptModal = ({ onClose, onSuccess, onGoRegister }) => {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const loggedInUser = await login(form.email, form.password);
      onSuccess(loggedInUser);
    } catch (err) {
      setError(err.response?.data?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
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
            className="text-neutral-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-white font-medium mt-4 mb-5">
          অর্ডার করতে প্রথমে লগইন করুন
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white text-sm focus:border-dune-amber outline-none"
          />
          <input
            required
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
            className="w-full bg-dune-amber hover:bg-dune-amberLight disabled:opacity-60 text-black font-semibold py-2.5 rounded-full text-sm transition-colors"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        <button
          onClick={onGoRegister}
          className="w-full text-center text-xs text-neutral-400 hover:text-white mt-4"
        >
          Don&apos;t have an account?{" "}
          <span className="text-dune-amber">Sign up</span>
        </button>
      </div>
    </div>
  );
};

export default LoginPromptModal;
