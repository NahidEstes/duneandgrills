import { formatAdminCurrency } from "./adminUi.js";

export const availableNumber = value => typeof value === "number" && Number.isFinite(value);
export const dashboardNumber = value => availableNumber(value) ? value.toLocaleString() : "—";
export const dashboardMoney = value => availableNumber(value) ? formatAdminCurrency(value) : "—";

export function successfulUpdateLabel(timestamp, now = Date.now()) {
  if (!Number.isFinite(timestamp)) return null;
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  const relative = seconds < 60 ? "just now" : seconds < 3600 ? `${Math.floor(seconds / 60)} min ago` : `${Math.floor(seconds / 3600)} hr ago`;
  const exact = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(timestamp);
  return { relative, exact: `${exact} · Asia/Riyadh`, iso: new Date(timestamp).toISOString() };
}
