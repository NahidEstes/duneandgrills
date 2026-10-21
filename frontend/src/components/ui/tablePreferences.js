export const PAGE_SIZES = [10, 15, 20, 25, 50, 100];
export const preferenceKey = (user, table) => user?._id ? `dg:table:v1:${user._id}:${user.role}:${table}` : null;
const safeText = (value, max) => typeof value === "string" ? value.slice(0, max) : "";
export function normalizePreferences(value, defaultPageSize) {
  return {
    pageSize: PAGE_SIZES.includes(value?.pageSize) ? value.pageSize : defaultPageSize,
    hidden: Array.isArray(value?.hidden) ? value.hidden.filter(key => typeof key === "string").slice(0, 50) : [],
    views: Array.isArray(value?.views) ? value.views.filter(row => row && typeof row.id === "string" && typeof row.name === "string" && row.filters && !Array.isArray(row.filters) && typeof row.filters === "object").slice(0, 10).map(row => ({ id: safeText(row.id, 80), name: safeText(row.name, 60), filters: Object.fromEntries(Object.entries(row.filters).filter(([key, field]) => !["__proto__", "prototype", "constructor"].includes(key) && ["string", "number", "boolean"].includes(typeof field)).map(([key, field]) => [key, typeof field === "string" ? field.slice(0, 250) : field])) })) : [],
  };
}

export function visibleTableColumns(columns, hidden) {
  const mandatory = columns.filter((column, index) => index === 0 || column.key === "actions" || column.required);
  return columns.filter(column => mandatory.includes(column) || !hidden.includes(column.key));
}

export function safeViewFilters(saved, current) {
  return Object.fromEntries(Object.entries(current).map(([key, value]) => [key, typeof saved?.[key] === typeof value ? saved[key] : value]));
}
