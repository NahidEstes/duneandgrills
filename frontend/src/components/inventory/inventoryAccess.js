export const INVENTORY_ROLES = ["admin", "manager", "inventory", "storekeeper"];
export const ACCOUNTANT_INVENTORY_PATHS = ["/inventory/supplier-invoices", "/inventory/purchasing-actions"];

export const inventoryPageRoles = pathname => ACCOUNTANT_INVENTORY_PATHS.includes(pathname)
  ? [...INVENTORY_ROLES, "accountant"] : INVENTORY_ROLES;

export const inventoryNavigationAllowed = (role, href) => role !== "accountant"
  || ACCOUNTANT_INVENTORY_PATHS.includes(href) || href === "/tips-and-tricks";
