import api from "./api.js";

export async function fetchRiderPortal(preview, signal, { rehearsal = false, status = "all", history = false, page = 1 } = {}) {
  rehearsal = rehearsal && !preview;
  const { data } = await api.get(rehearsal ? "/rider/workflow" : preview ? "/rider/preview" : "/rider/portal", { signal,
    ...(!preview ? { params: { status, history: String(history), limit: 20, page } } : {}) });
  // Preview never accepts real data. Live lists still enforce the session rider.
  if (!data.success || data.operationalEnabled !== (data.mode === "operational") || ![...(preview ? ["preview"] : ["disabled", "operational", ...(rehearsal ? ["rehearsal"] : [])])].includes(data.mode)
      || !data.profile?.id || !Array.isArray(data.deliveries)
      || (data.mode === "disabled" && data.deliveries.length)
      || data.deliveries.some(row => (data.mode === "preview" ? row.synthetic !== true : row.synthetic === true) || row.riderId !== data.profile.id)) {
    throw new Error("Unexpected rider response; reload your private workspace.");
  }
  return data;
}
