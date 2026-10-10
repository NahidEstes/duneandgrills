import { invalidateContent } from "@/src/cache/invalidate.js";

const backendApiUrl = (
  process.env.BACKEND_API_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

const proxyRequest = async (request, { params }) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const allowed = new Set([request.nextUrl.origin, process.env.SITE_URL].filter(Boolean));
    if (origin && !allowed.has(origin)) return Response.json({ success: false, message: "Request origin is not allowed" }, { status: 403 });
  }
  const { path } = await params;
  const target = new URL(`${backendApiUrl}/${path.join("/")}`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  ["accept", "authorization", "content-type", "cookie", "origin", "idempotency-key", "x-csrf-token", "x-pos-session", "x-order-tracking-token", "x-request-id"].forEach((name) => {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  });
  if (process.env.API_PROXY_SECRET) {
    headers.set("x-dg-proxy-secret", process.env.API_PROXY_SECRET);
    // Vercel overwrites this platform header; arbitrary x-forwarded-for is never relayed.
    const address = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : null;
    if (address && /^[0-9a-fA-F:.]{3,64}$/.test(address)) headers.set("x-dg-client-ip", address);
  }

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
      credentials: "include",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(path.join("/") === "kitchen/events" ? 60000 : 15000)]),
    });

    const responseHeaders = new Headers();
    const contentType = response.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    for (const name of ["x-request-id", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset", "retry-after", "date", "x-accel-buffering"]) {
      const value = response.headers.get(name); if (value) responseHeaders.set(name, value);
    }
    const setCookies = response.headers.getSetCookie?.() || [];
    if (setCookies.length) setCookies.forEach((cookie) => responseHeaders.append("set-cookie", cookie));
    else if (response.headers.get("set-cookie")) responseHeaders.set("set-cookie", response.headers.get("set-cookie"));
    responseHeaders.set(
      "cache-control",
      "no-store, no-cache, must-revalidate, max-age=0"
    );
    responseHeaders.set("pragma", "no-cache");
    responseHeaders.set("expires", "0");
    if (request.method === "GET" && path.length === 1 && ["menu", "categories", "combos"].includes(path[0]) && response.ok && !setCookies.length && !response.headers.has("set-cookie")) {
      responseHeaders.set("X-DG-Public-Catalog", "1");
      responseHeaders.set("Cache-Control", "public, max-age=0, must-revalidate");
    }

    if (
      response.ok &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method)
    ) {
      try {
        const resource = path[0];
        if (resource === "menu") invalidateContent("menu");
        if (resource === "combos") invalidateContent("combos");
        if (resource === "blog") invalidateContent("blog");
        if (resource === "orders") invalidateContent("orders");
        if (resource === "offers") invalidateContent("offers");
        if (resource === "rewards") invalidateContent("rewards");
        if (resource === "settings") invalidateContent("settings");
        if (resource === "categories") {
          invalidateContent("menu");
          invalidateContent("blog");
        }
      } catch {
        // The mutation already succeeded in Express. Never turn that success
        // into an API error solely because revalidation could not run.
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      {
        success: false,
        message: "The API server is currently unavailable",
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  }
};

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;

export const OPTIONS = () => new Response(null, { status: 204 });

export const dynamic = "force-dynamic";
