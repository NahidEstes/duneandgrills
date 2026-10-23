import { INVENTORY_ROLES, inventoryNavigationAllowed } from "./inventoryAccess.js";

export const navigationGroups = [
  ["Overview", ["/inventory"]],
  ["Stock", ["/inventory/stock-items", "/inventory/batches", "/inventory/stock-in", "/inventory/stock-out", "/inventory/stock-movements", "/inventory/waste-damaged", "/inventory/inventory-count", "/inventory/categories"]],
  ["Purchasing", ["/inventory/suppliers", "/inventory/purchase-orders", "/inventory/supplier-invoices", "/inventory/purchase-prices", "/inventory/reorder-suggestions", "/inventory/purchasing-actions"]],
  ["Recipes & Production", ["/inventory/recipes", "/inventory/preparation-recipes", "/inventory/production"]],
  ["Monitoring & Reports", ["/inventory/expiry-tracking", "/inventory/low-stock-alerts", "/inventory/reports"]],
  ["Settings & Help", ["/inventory/settings", "/tips-and-tricks"]],
];
export function allowedNavigation(role, entries) {
  if (![...INVENTORY_ROLES, "accountant"].includes(role)) return [];
  return entries.filter(([, href, , roles]) => (!roles || roles.includes(role)) && inventoryNavigationAllowed(role, href));
}
export function navigationPreferences(value, allowed) {
  const paths = new Set(allowed.map(entry => entry[1]));
  return { pinned: [...new Set(Array.isArray(value?.pinned) ? value.pinned : [])].filter(path => paths.has(path)).slice(0, 10), collapsed: Array.isArray(value?.collapsed) ? value.collapsed.filter(name => navigationGroups.some(([group]) => group === name)) : [] };
}
