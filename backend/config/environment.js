export function validateEnvironment(env = process.env) {
  if (env.NODE_ENV !== "production") return [];
  const errors = [];
  if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGO_URI || "")) errors.push("MONGO_URI is required");
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || /replace|example|changeme/i.test(env.JWT_SECRET)) errors.push("JWT_SECRET must contain at least 32 characters and cannot be an example value");
  const origins = String(env.CLIENT_ORIGINS || env.CLIENT_ORIGIN || "").split(",").map(value => value.trim()).filter(Boolean);
  if (!origins.length || origins.some(value => { try { const url = new URL(value); return url.protocol !== "https:" || url.origin !== value; } catch { return true; } })) errors.push("CLIENT_ORIGINS must contain exact HTTPS origins");
  if (env.ALLOW_NON_TRANSACTIONAL_INVENTORY === "true") errors.push("Non-transactional inventory fallback must be disabled");
  if (!["lax", "strict", "none"].includes(env.COOKIE_SAME_SITE || "lax")) errors.push("COOKIE_SAME_SITE must be lax, strict or none");
  if (env.API_PROXY_SECRET && (env.API_PROXY_SECRET.length < 32 || /replace|example|changeme/i.test(env.API_PROXY_SECRET))) errors.push("API_PROXY_SECRET must contain at least 32 characters");
  if (env.TRUST_PROXY_HOPS && !/^\d+$/.test(env.TRUST_PROXY_HOPS)) errors.push("TRUST_PROXY_HOPS must be an explicit non-negative integer");
  return errors;
}
