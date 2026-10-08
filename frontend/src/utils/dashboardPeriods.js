export const DASHBOARD_PERIODS = Object.freeze([
  { value: "today", label: "Today" }, { value: "week", label: "Last 7 Days" },
  { value: "month", label: "This Month" }, { value: "all", label: "All Time" },
]);
export const normalizeDashboardPeriod = value => DASHBOARD_PERIODS.some(period => period.value === value) ? value : "today";
