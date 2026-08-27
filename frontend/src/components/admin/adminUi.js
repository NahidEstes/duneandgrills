export const formatAdminCurrency = (amount) =>
  new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    currencyDisplay: "code",
    minimumFractionDigits: 2,
  })
    .format(Number(amount) || 0)
    .replace("SAR", "SAR ")
    .replace(/\s+/g, " ")
    .trim();

export const formatAdminDate = (value, options = {}) =>
  new Intl.DateTimeFormat("en-SA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  }).format(new Date(value));

export const formatRelativeTime = (value) => {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const ranges = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let valueInUnit = seconds;
  for (const [divisor, unit] of ranges) {
    if (Math.abs(valueInUnit) < divisor) {
      return formatter.format(Math.round(valueInUnit), unit);
    }
    valueInUnit /= divisor;
  }
  return "recently";
};

export const statusStyles = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  confirmed: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  preparing: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  "out-for-delivery": "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  delivered: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-300",
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  upcoming: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  expired: "border-red-500/30 bg-red-500/10 text-red-300",
  inactive: "border-neutral-500/30 bg-neutral-500/10 text-neutral-300",
};

export const labelStatus = (value = "") =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
