export const formatSar = (value) => new Intl.NumberFormat("en-SA", { style: "currency", currency: "SAR", currencyDisplay: "code", minimumFractionDigits: 2 }).format(Number(value) || 0);
export const formatDate = (value) => value ? new Intl.DateTimeFormat("en-SA", { timeZone: "Asia/Riyadh", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
export const dateValue = (value) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "";
export const todayValue = () => dateValue(new Date());
export const monthRange = (now = new Date()) => {
  const [year, month] = dateValue(now).split("-").map(Number);
  return { from: `${year}-${String(month).padStart(2, "0")}-01`, to: `${year}-${String(month).padStart(2, "0")}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}` };
};
export const errorMessage = (error, fallback = "Unable to complete this request.") => error?.response?.data?.message || error?.message || fallback;
export const statusTone = (status) => status === "paid" ? "success" : status === "partially_paid" ? "warning" : "danger";
export const humanize = (value = "") => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
