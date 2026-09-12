const secondsFromEnvironment = (value, fallback, minimum) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
};

export const KITCHEN_POLL_INTERVAL_MS = secondsFromEnvironment(
  process.env.NEXT_PUBLIC_KITCHEN_POLL_SECONDS,
  5,
  3
) * 1000;

export const KITCHEN_HIDDEN_POLL_INTERVAL_MS = secondsFromEnvironment(
  process.env.NEXT_PUBLIC_KITCHEN_HIDDEN_POLL_SECONDS,
  15,
  10
) * 1000;

export const KITCHEN_ALERT_REPEAT_MS = 4000;

export const KITCHEN_COLUMNS = [
  { status: "pending", label: "New", accent: "amber" },
  { status: "confirmed", label: "Accepted", accent: "sky" },
  { status: "preparing", label: "Preparing", accent: "orange" },
  { status: "ready", label: "Ready", accent: "emerald" },
];
