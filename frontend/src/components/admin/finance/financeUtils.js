export const formatSar = (value) => new Intl.NumberFormat("en-SA", { style: "currency", currency: "SAR", currencyDisplay: "code", minimumFractionDigits: 2 }).format(Number(value) || 0);
export const formatDate = (value) => value ? new Intl.DateTimeFormat("en-SA", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
export const dateValue = (value) => value ? new Date(value).toISOString().slice(0, 10) : "";
export const todayValue = () => new Date().toISOString().slice(0, 10);
export const monthRange = () => {
  const now = new Date();
  return {
    from: new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)).toISOString().slice(0, 10),
  };
};
export const errorMessage = (error, fallback = "Unable to complete this request.") => error?.response?.data?.message || error?.message || fallback;
export const statusTone = (status) => status === "paid" ? "success" : status === "partially_paid" ? "warning" : "danger";
export const humanize = (value = "") => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
