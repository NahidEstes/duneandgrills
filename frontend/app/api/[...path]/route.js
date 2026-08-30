import { invalidateContent } from "@/src/cache/invalidate.js";

const backendApiUrl = (
  process.env.BACKEND_API_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

const proxyRequest = async (request, { params }) => {
  const { path } = await params;
  const target = new URL(`${backendApiUrl}/${path.join("/")}`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  ["accept", "authorization", "content-type"].forEach((name) => {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  });

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
    });

    const responseHeaders = new Headers();
    const contentType = response.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    responseHeaders.set(
      "cache-control",
      "no-store, no-cache, must-revalidate, max-age=0"
    );
    responseHeaders.set("pragma", "no-cache");
    responseHeaders.set("expires", "0");

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
