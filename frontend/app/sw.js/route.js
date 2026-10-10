import { readFile } from "node:fs/promises";
import path from "node:path";
import workerSource from "@/src/pwa/workerSource.js";
import { PWA_VERSION } from "@/src/pwa/config.js";

let buildVersion;
async function version() {
  if (!buildVersion) buildVersion = Promise.resolve(process.env.PWA_CACHE_VERSION || process.env.VERCEL_DEPLOYMENT_ID || process.env.NEXT_PUBLIC_PWA_BUILD_ID || readFile(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").catch(() => PWA_VERSION)).then(value => String(value).trim().replace(/[^A-Za-z0-9._-]/g, "").slice(0, 100));
  return buildVersion;
}
export async function GET() {
  const source = workerSource.replace("__DG_BUILD_VERSION__", await version());
  return new Response(source, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store, max-age=0", "Service-Worker-Allowed": "/" } });
}
export const dynamic = "force-dynamic";
