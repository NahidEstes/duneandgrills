import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { staffRoles } from "./policy.js";

export const readServerSession = cache(async () => {
  const incoming = await headers();
  const backend = (process.env.BACKEND_API_URL || "http://localhost:5000/api").replace(/\/$/, "");
  try {
    const response = await fetch(`${backend}/auth/session`, { headers: { cookie: incoming.get("cookie") || "" }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if ([401, 403].includes(response.status)) return { user: null };
    if (!response.ok) return { unavailable: true };
    const body = await response.json();
    return body.user ? { user: body.user } : { unavailable: true };
  } catch { return { unavailable: true }; }
});
export default async function StaffGuard({ children, basePath }) {
  const incomingPath = (await headers()).get("x-dg-path");
  const path = incomingPath && (incomingPath === basePath || incomingPath.startsWith(`${basePath}/`)) ? incomingPath : basePath;
  const roles = staffRoles(path);
  if (!roles) return children;
  const session = await readServerSession();
  if (session.unavailable) return <main className="grid min-h-dvh place-content-center gap-4 bg-neutral-950 p-8 text-white"><h1 className="text-2xl">Workspace temporarily unavailable</h1><p>Reconnect and retry. Your saved sale has not been submitted again.</p><a href={path} className="text-amber-300 underline">Retry workspace</a></main>;
  if (!session.user) redirect(`/login?returnTo=${encodeURIComponent(path)}`);
  if (!roles.includes(session.user.role)) redirect("/?access=denied");
  return children;
}
