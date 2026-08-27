"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

const EMPTY_TIME = { days: 0, hours: 0, minutes: 0, seconds: 0 };

const calculateRemaining = (expiresAt) => {
  const difference = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(difference) || difference <= 0) return EMPTY_TIME;

  return {
    days: Math.floor(difference / 86_400_000),
    hours: Math.floor((difference / 3_600_000) % 24),
    minutes: Math.floor((difference / 60_000) % 60),
    seconds: Math.floor((difference / 1_000) % 60),
  };
};

const PARTS = [
  ["days", "Days"],
  ["hours", "Hrs"],
  ["minutes", "Mins"],
  ["seconds", "Secs"],
];

const CountdownTimer = ({ expiresAt, onExpire, compact = false }) => {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    let expirationReported = false;
    let interval;

    const update = () => {
      const next = calculateRemaining(expiresAt);
      setRemaining(next);

      const expired = Object.values(next).every((value) => value === 0);
      if (expired && !expirationReported) {
        expirationReported = true;
        if (interval) window.clearInterval(interval);
        onExpire?.();
      }
    };

    update();
    if (!expirationReported) interval = window.setInterval(update, 1000);
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [expiresAt, onExpire]);

  const values = remaining || EMPTY_TIME;

  return (
    <div
      className={`rounded-xl border border-dashed border-dune-amber/55 bg-black/70 ${
        compact ? "p-3" : "p-5"
      }`}
      aria-label="Countdown until this offer expires"
    >
      <div className="flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
        <Clock3 className="h-3.5 w-3.5 text-dune-amber" aria-hidden="true" />
        Offer ends in
      </div>
      <time dateTime={expiresAt} className="mt-4 grid grid-cols-4 gap-2">
        {PARTS.map(([key, label]) => (
          <span key={key} className="min-w-0 text-center">
            <span
              className={`block font-display leading-none text-dune-amber ${
                compact ? "text-2xl" : "text-3xl"
              }`}
            >
              {String(values[key]).padStart(2, "0")}
            </span>
            <span className="mt-1.5 block text-[9px] uppercase tracking-wide text-neutral-400">
              {label}
            </span>
          </span>
        ))}
      </time>
    </div>
  );
};

export default CountdownTimer;
