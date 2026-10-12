import api from "./api.js";

export async function fetchRiderPortal(preview, signal, { rehearsal = false, status = "all", history = false, page = 1 } = {}) {
  rehearsal = rehearsal && !preview;
  const { data } = await api.get(rehearsal ? "/rider/workflow" : preview ? "/rider/preview" : "/rider/portal", { signal,
    ...(rehearsal ? { params: { status, history: String(history), limit: 20, page } } : {}) });
  // Fail closed if a future backend accidentally serves operational data to this preview UI.
  if (!data.success || data.operationalEnabled !== false || !["preview", "disabled", ...(rehearsal ? ["rehearsal"] : [])].includes(data.mode)
      || !data.profile?.id || !Array.isArray(data.deliveries)
      || (data.mode === "disabled" && data.deliveries.length)
      || data.deliveries.some(row => (!rehearsal && row.synthetic !== true) || row.riderId !== data.profile.id)) {
    throw new Error("Unexpected rider preview response. Live data has not been displayed.");
  }
  return data;
}
