"use server";

import { invalidateContent } from "@/src/cache/invalidate.js";

export async function refreshContentCache(contentType) {
  invalidateContent(contentType);
}
