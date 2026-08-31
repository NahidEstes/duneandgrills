export const formatSar = (value, options = {}) =>
  new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    currencyDisplay: "code",
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  }).format(Number(value) || 0);

export const formatQuantity = (value, unit = "") =>
  `${new Intl.NumberFormat("en-SA", { maximumFractionDigits: 3 }).format(Number(value) || 0)}${unit ? ` ${unit}` : ""}`;

export const formatDate = (value, withTime = false) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-SA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
};

export const daysUntil = (value) => Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);

export const getStockStatus = (item) => {
  if (!item.isActive) return { label: "Inactive", tone: "neutral" };
  if (Number(item.currentStock) <= 0) return { label: "Out of stock", tone: "danger" };
  if (Number(item.currentStock) <= Number(item.reorderLevel)) return { label: "Low stock", tone: "warning" };
  return { label: "In stock", tone: "success" };
};

export const humanize = (value = "") =>
  value.toLowerCase().replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export const apiErrorMessage = (error, fallback = "Something went wrong") => error?.response?.data?.message || error?.message || fallback;

export const INVENTORY_UNITS = ["kg", "g", "L", "ml", "pcs", "box", "pack", "bottle", "can", "tray"];
