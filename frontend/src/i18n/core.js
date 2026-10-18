import { arabic } from "./ar.js";
import { webArabic } from "./webArabic.js";
const dictionary = { ...arabic, ...webArabic };
export const LANGUAGE_KEY = "dg.language.v1";
let selected = "en";
const listeners = new Set();
export const isCustomerPath = path => !/^\/(admin|inventory|pos|kitchen|rider|staff-clock|tips-and-tricks)(\/|$)/.test(path || "/");
export const getLanguage = () => typeof window !== "undefined" && !isCustomerPath(window.location.pathname) ? "en" : selected;
export const subscribeLanguage = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function changeLanguage(value) { if (!["ar", "en"].includes(value)) return; selected = value; listeners.forEach(listener => listener()); }
export const locale = () => getLanguage() === "ar" ? "ar-SA-u-ca-gregory" : "en-GB";
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let templates;
export function t(value, values) {
  if (typeof value !== "string" || !value) return value;
  let translated = value;
  if (getLanguage() === "ar") {
    const trimmed = value.trim();
    if (dictionary[trimmed]) translated = value.replace(trimmed, dictionary[trimmed]);
    else if (!values) {
      templates ||= Object.entries(dictionary).filter(([key]) => /\{\d+\}/.test(key)).sort(([a], [b]) => b.length - a.length).map(([key, text]) => ({ expression: new RegExp("^" + key.split(/\{\d+\}/).map(escape).join("([\\s\\S]+?)") + "$"), text }));
      for (const row of templates) { const match = trimmed.match(row.expression); if (match) { translated = row.text.replace(/\{(\d+)\}/g, (_, index) => `\u2068${match[Number(index) + 1]}\u2069`); break; } }
      if (translated === value && trimmed.includes(" · ")) translated = value.split(" · ").map(part => t(part)).join(" · ");
    }
  }
  return values ? translated.replace(/\{(\d+)\}/g, (_, index) => getLanguage() === "ar" ? `\u2068${String(values[index] ?? "")}\u2069` : String(values[index] ?? "")) : translated;
}
export const catalogText = (product, field = "name") => [product?.translations?.[getLanguage()]?.[field], product?.translations?.en?.[field], product?.[field]].find(value => typeof value === "string" && value.trim())?.trim() || "";
export const formatNumber = value => new Intl.NumberFormat(locale()).format(value);
export function formatDate(value, options = { dateStyle: "medium", timeStyle: "short" }) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale(), { ...options, timeZone: "Asia/Riyadh" }).format(date) : t("Date unavailable");
}
export const normalizeDigits = value => String(value).replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 0x06f0 : 0x0660))).replaceAll("٫", ".");
