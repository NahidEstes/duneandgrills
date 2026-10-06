import { ValidationError } from "../utils/inventoryValidation.js";
import { ADMIN_DAY_MS, parseRiyadhDate, startOfRiyadhDay, toRiyadhDateKey } from "../utils/adminDate.js";
import { buildSalesReport } from "./salesReportingService.js";

export const resolveAnalyticsRange = ({ period = "week", from, to }, now = new Date()) => {
  const today = startOfRiyadhDay(now);
  let start;
  let end = new Date(today.getTime() + ADMIN_DAY_MS);
  if (period === "today") start = today;
  else if (period === "week") start = new Date(today.getTime() - 6 * ADMIN_DAY_MS);
  else if (period === "month") start = parseRiyadhDate(`${toRiyadhDateKey(now).slice(0, 7)}-01`);
  else if (period === "custom") {
    if (!from || !to) throw new ValidationError("Choose both From and To dates");
    start = parseRiyadhDate(from, "analytics date");
    end = new Date(parseRiyadhDate(to, "analytics date").getTime() + ADMIN_DAY_MS);
  } else throw new ValidationError("period must be today, week, month or custom");
  if (start >= end) throw new ValidationError("From date must be before or equal to To date");
  const days = Math.ceil((end - start) / ADMIN_DAY_MS);
  if (days > 366) throw new ValidationError("Analytics date range cannot exceed 366 days");
  return { start, end, days, period };
};

export const buildAdminAnalytics = async (query = {}) => {
  const range = resolveAnalyticsRange(query);
  return {
    generatedAt: new Date(),
    range: { ...range, from: toRiyadhDateKey(range.start), to: toRiyadhDateKey(new Date(range.end.getTime() - ADMIN_DAY_MS)) },
    filters: { source: query.source || "all", orderType: query.orderType || "all" },
    ...await buildSalesReport({ query, range }),
  };
};
