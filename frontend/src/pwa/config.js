export const PWA_VERSION = "2026-10-10-b1";
export const PWA_THEME = "#09090b";
export function appKind(pathname = "/") {
  if (pathname === "/pos" || pathname.startsWith("/pos/")) return "pos";
  if (pathname === "/kitchen" || pathname.startsWith("/kitchen/")) return "kitchen";
  return "customer";
}
export function createManifest(kind = "customer") {
  const names = { customer: "Dune & Grills", pos: "Dune & Grills POS", kitchen: "Dune & Grills Kitchen" };
  const route = kind === "customer" ? "/" : `/${kind}`;
  return {
    id: route, name: names[kind] || names.customer, short_name: kind === "customer" ? "Dune & Grills" : `Dune ${kind === "pos" ? "POS" : "Kitchen"}`,
    description: kind === "customer" ? "Order for pickup or delivery from Dune & Grills." : "Authenticated restaurant workspace. Internet connection required for operations.",
    start_url: route, scope: route, display: "standalone", background_color: PWA_THEME, theme_color: PWA_THEME,
    lang: "en", dir: "ltr",
    icons: [192, 512].map(size => ({ src: `/pwa/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })).concat([{ src: "/pwa/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }]),
    ...(kind === "customer" ? { shortcuts: [{ name: "Menu", url: "/menu" }, { name: "My account", url: "/profile" }] } : {}),
  };
}
