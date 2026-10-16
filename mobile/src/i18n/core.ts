import { arabic } from './ar';
export type Language = 'en' | 'ar';
let language: Language = 'en';
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export const subscribeLanguage = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const changeLanguage = (value: Language) => { language = value; listeners.forEach(listener => listener()); };
export const locale = () => language === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB';
export const normalizeDigits = (value: string) => value.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= '۰' ? 0x06f0 : 0x0660))).replaceAll('٫', '.');
export const formatNumber = (value: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 20 }).format(value);
export const formatMoney = (value: number) => language === 'en' ? `SAR ${Number(value).toFixed(2)}` : new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(value);
export const formatDate = (value: string | Date) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale(), { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date) : t('Date unavailable');
};
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = Object.entries(arabic).filter(([key]) => /\{\d+\}/.test(key)).sort(([a], [b]) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length).map(([key, value]) => ({ expression: new RegExp('^' + key.split(/\{\d+\}/).map(escape).join('([\\s\\S]+?)') + '$'), value }));
export function t(value: string): string {
  if (language === 'en' || !value) return value;
  const trimmed = value.trim();
  const direct = arabic[trimmed];
  if (direct) return value.replace(trimmed, direct);
  for (const row of templates) {
    const match = trimmed.match(row.expression);
    if (match) return value.replace(trimmed, row.value.replace(/\{(\d+)\}/g, (_, index) => '\u2068' + t(match[Number(index) + 1]) + '\u2069'));
  }
  if (trimmed.includes(' · ')) return value.split(' · ').map(t).join(' · ');
  return value;
}
export function catalogText(product: { name?: string; description?: string; translations?: Partial<Record<Language, { name?: string; description?: string }>> }, field: 'name' | 'description' = 'name') {
  return product.translations?.[language]?.[field]?.trim() || product[field] || '';
}
