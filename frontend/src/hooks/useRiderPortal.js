"use client";
import { fetchRiderPortal } from "../api/riderApi.js";
import useRiderRead from "./useRiderRead.js";

export default function useRiderPortal(user, preview, rehearsal = false, status = "all", history = false, page = 1, filters = {}) {
  const scope = `${user?._id || user?.id || ""}:${user?.role}:${preview}:${rehearsal}`;
  const query = { ...filters, rehearsal, status, history, page };
  return useRiderRead(scope, JSON.stringify(query), signal => fetchRiderPortal(preview, signal, query), !!user && ["admin", "rider"].includes(user.role));
}
