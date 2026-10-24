import { ValidationError } from "../utils/inventoryValidation.js";
import { recipeConversionFactor } from "./recipeUnitConversion.js";

export const ALERT_INTERVALS = [15, 30, 60, 120, 240];
export const EVALUATION_MS = 60_000;
export const riyadhClock = (now) => {
  const local = new Date(now.getTime() + 3 * 3600_000).toISOString();
  return { day: local.slice(0, 10), time: local.slice(11, 16) };
};
export const alertSeverity = (rule, item) => {
  if (!rule.enabled || !item || item.isActive === false || item.unit !== rule.baseUnit) return null;
  const available = Number(item.saleableStock);
  if (!Number.isFinite(available)) return null;
  if (available <= 0) return rule.outEnabled ? "out" : null;
  return rule.lowEnabled && available <= rule.threshold ? "low" : null;
};
export function normalizeAlertRule(body, item) {
  const allowed = ["item", "enabled", "lowEnabled", "outEnabled", "enteredThreshold", "enteredUnit", "mode", "repeatMinutes", "dailyTime", "recipients", "expectedVersion"];
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) throw new ValidationError("Unknown alert rule fields");
  for (const field of ["enabled", "lowEnabled", "outEnabled"]) if (typeof body[field] !== "boolean") throw new ValidationError(`Choose ${field} explicitly`);
  if (body.enabled && !body.lowEnabled && !body.outEnabled) throw new ValidationError("Enable at least one alert condition");
  if (!["number", "string"].includes(typeof body.enteredThreshold) || String(body.enteredThreshold).trim() === "" || !Number.isFinite(Number(body.enteredThreshold)) || Number(body.enteredThreshold) < 0 || Number(body.enteredThreshold) > 1e9) throw new ValidationError("Threshold must be a finite non-negative quantity");
  if (typeof body.enteredUnit !== "string") throw new ValidationError("Choose a threshold unit");
  const threshold = Number((Number(body.enteredThreshold) * recipeConversionFactor(body.enteredUnit, item).factor).toFixed(6));
  if (!Number.isFinite(threshold) || threshold > 1e9 || (Number(body.enteredThreshold) > 0 && threshold < .000001)) throw new ValidationError("Converted threshold exceeds inventory precision");
  if (!["repeat", "daily"].includes(body.mode) || !ALERT_INTERVALS.includes(Number(body.repeatMinutes))) throw new ValidationError("Choose a supported timing mode and reminder interval");
  if (typeof body.dailyTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.dailyTime)) throw new ValidationError("Daily check requires a valid Riyadh time");
  if (!Array.isArray(body.recipients) || (body.enabled && !body.recipients.length) || body.recipients.length > 30 || new Set(body.recipients.map(String)).size !== body.recipients.length) throw new ValidationError("Enabled rules need between 1 and 30 distinct recipients");
  return { enabled: body.enabled, lowEnabled: body.lowEnabled, outEnabled: body.outEnabled, threshold, baseUnit: item.unit,
    enteredThreshold: Number(body.enteredThreshold), enteredUnit: body.enteredUnit, mode: body.mode,
    repeatMinutes: Number(body.repeatMinutes), dailyTime: body.dailyTime, recipients: body.recipients };
}

export function recipientDue(rule, receipt, severity, now, dailyDue) {
  if (receipt?.snoozedUntil && new Date(receipt.snoozedUntil) > now) return false;
  if (rule.mode === "daily") return dailyDue;
  return !receipt?.lastSentAt || receipt.lastSeverity !== severity || !receipt.nextReminderAt || new Date(receipt.nextReminderAt) <= now;
}
