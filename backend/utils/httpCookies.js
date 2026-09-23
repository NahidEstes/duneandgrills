import crypto from "crypto";

export const SESSION_COOKIE = "dg_session";
export const CSRF_COOKIE = "dg_csrf";

const isProduction = () => process.env.NODE_ENV === "production";
const sameSite = () => process.env.COOKIE_SAME_SITE || "lax";

export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: sameSite(),
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

export const csrfCookieOptions = () => ({
  httpOnly: false,
  secure: isProduction(),
  sameSite: sameSite(),
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

export const issueSessionCookies = (res, token) => {
  const csrf = crypto.randomBytes(32).toString("base64url");
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.cookie(CSRF_COOKIE, csrf, csrfCookieOptions());
  return csrf;
};

export const clearSessionCookies = (res) => {
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
  res.clearCookie(CSRF_COOKIE, { ...csrfCookieOptions(), maxAge: undefined });
};

export const parseCookies = (header = "") => Object.fromEntries(
  String(header).split(";").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const separator = entry.indexOf("=");
    const key = separator >= 0 ? entry.slice(0, separator) : entry;
    const value = separator >= 0 ? entry.slice(separator + 1) : "";
    return [decodeURIComponent(key), decodeURIComponent(value)];
  })
);

