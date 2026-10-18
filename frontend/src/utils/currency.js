// Central currency formatter — change this once and it updates everywhere.
import { getLanguage, isCustomerPath } from "../i18n/core.js";
export const formatPrice = (amount) => getLanguage() === "ar" ? new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", currencyDisplay: "code" }).format(Number(amount)) : typeof window !== "undefined" && isCustomerPath(window.location.pathname) ? `${new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(Number(amount))} SAR` : `${Number(amount).toFixed(2)} SAR`;
