export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/profile", "/login", "/api/"],
    },
    sitemap: "https://duneandgrills.com/sitemap.xml",
    host: "https://duneandgrills.com",
  };
}
