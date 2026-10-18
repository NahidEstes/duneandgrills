"use client";
import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { changeLanguage, getLanguage, isCustomerPath, LANGUAGE_KEY, subscribeLanguage, t } from "./core.js";
import "./locale.css";
export const useLanguage = () => useSyncExternalStore(subscribeLanguage, getLanguage, () => "en");
export function LocaleProvider({ children }) {
  const pathname = usePathname(), language = useLanguage();
  useEffect(() => { try { const stored = localStorage.getItem(LANGUAGE_KEY); if (["en", "ar"].includes(stored)) changeLanguage(stored); } catch { /* Language selection still works for this visit. */ }
    const sync = event => { if (event.key === LANGUAGE_KEY) changeLanguage(event.newValue); }; window.addEventListener("storage", sync); return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => { const active = isCustomerPath(pathname); document.documentElement.lang = active ? language : "en"; document.documentElement.dir = active && language === "ar" ? "rtl" : "ltr"; document.documentElement.dataset.customerLocale = active ? language : ""; }, [language, pathname]);
  useEffect(() => {
    if (!isCustomerPath(pathname)) return;
    const clear = event => { if (event.target.dataset?.localeValidation) { event.target.setCustomValidity(""); delete event.target.dataset.localeValidation; } };
    const invalid = event => { const field = event.target; if (!field.validity || !field.setCustomValidity) return; const validity = field.validity;
      const message = validity.valueMissing ? t("Please fill out this field.") : validity.typeMismatch ? t("Enter a valid email address.") : validity.tooShort ? t("Use at least {0} characters.", [field.minLength]) : validity.patternMismatch ? t("Please use the requested format.") : "";
      if (message) { field.setCustomValidity(message); field.dataset.localeValidation = "true"; }
    };
    document.querySelectorAll("[data-locale-validation]").forEach(field => clear({ target: field }));
    document.addEventListener("invalid", invalid, true); document.addEventListener("input", clear, true);
    return () => { document.removeEventListener("invalid", invalid, true); document.removeEventListener("input", clear, true); };
  }, [language, pathname]);
  return children;
}
export function LanguageSwitcher({ className = "" }) {
  const language = useLanguage();
  return <button type="button" onClick={() => { const next = language === "ar" ? "en" : "ar"; try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* Session-only preference if storage is unavailable. */ } changeLanguage(next); }} className={`customer-language-switch min-h-11 rounded-full border border-white/25 px-3 text-sm text-white focus-visible:outline focus-visible:outline-amber-300 ${className}`} aria-label={t("Change language")} lang={language === "ar" ? "en" : "ar"} dir="auto">{language === "ar" ? "English" : "العربية"}</button>;
}
// A stable component type subscribes to language without remounting forms/cart.
export function withLocale(Component) {
  function LocalizedComponent(props) { useLanguage(); return <Component {...props} />; }
  LocalizedComponent.displayName = `Localized(${Component.displayName || Component.name || "Customer"})`;
  return LocalizedComponent;
}
