import { NextResponse } from "next/server";
import { contentSecurityPolicy, staffRoles } from "./src/security/policy.js";

export function proxy(request) {
  const path = request.nextUrl.pathname;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("x-dg-path", path); // Overwrite caller input; the server layout uses only this value.
  headers.set("Content-Security-Policy", policy);
  const protectedPage = staffRoles(path);
  let response;
  if (protectedPage && !request.cookies.get("dg_session")?.value) {
    const login = new URL("/login", request.url);
    login.searchParams.set("returnTo", path);
    response = NextResponse.redirect(login);
  } else response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  if (protectedPage) response.headers.set("Cache-Control", "private, no-store");
  if (process.env.SITE_ENV !== "production") response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
export const config = { matcher: ["/((?!api/|_next/static|_next/image|pwa/|sw.js|offline.html|.*\\.(?:png|jpg|jpeg|svg|ico|webmanifest|xml|txt)$).*)", "/pos/:path*", "/kitchen/:path*", "/admin/:path*"] };
