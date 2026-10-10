"use server";

import { invalidateContent } from "@/src/cache/invalidate.js";
import { readServerSession } from "@/src/security/serverSession.js";

export async function refreshContentCache(contentType) {
  const session = await readServerSession();
  if (!session.user || !["admin", "manager"].includes(session.user.role)) return;
  invalidateContent(contentType);
}
