import { siteOrigin, indexable } from "@/src/config/site.js";
export default function robots() {
  if (!indexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/pos", "/kitchen", "/inventory", "/staff-clock", "/profile", "/login", "/api/"],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
    host: siteOrigin(),
  };
}
