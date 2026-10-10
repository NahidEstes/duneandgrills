export function contentSecurityPolicy(nonce, development = false) {
  return ["default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // Existing receipt/report and chart styles use style attributes. Script execution remains nonce restricted.
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self' data:",
    `connect-src 'self'${development ? " ws: wss:" : ""}`, "frame-src https://www.google.com https://maps.google.com",
    "worker-src 'self'", "manifest-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join("; ");
}
export function staffRoles(pathname) {
  if (["/pos/customer-display", "/pos/manifest.webmanifest", "/kitchen/manifest.webmanifest"].includes(pathname)) return null;
  if (pathname === "/pos" || pathname.startsWith("/pos/")) return ["admin", "manager", "cashier"];
  if (pathname === "/kitchen" || pathname.startsWith("/kitchen/")) return ["admin", "manager", "kitchen"];
  if (pathname === "/admin/expenses" || pathname.startsWith("/admin/expenses/")) return ["admin", "manager", "accountant"];
  if (pathname === "/admin/record-search" || pathname.startsWith("/admin/record-search/")) return ["admin", "manager", "cashier", "inventory", "storekeeper", "accountant"];
  if (pathname === "/admin/quick-delivery") return ["admin", "manager", "cashier"];
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return ["admin", "manager"];
  return null;
}
