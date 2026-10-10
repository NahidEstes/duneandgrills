export function siteOrigin(env = process.env) {
  const value = env.SITE_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "http://localhost:3000");
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("SITE_URL must be an HTTP(S) origin");
  return url.origin;
}
export const indexable = () => process.env.SITE_ENV === "production";
