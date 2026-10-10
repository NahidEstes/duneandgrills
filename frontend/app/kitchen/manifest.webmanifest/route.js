import { createManifest } from "@/src/pwa/config.js";
export function GET() { return Response.json(createManifest("kitchen"), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } }); }
