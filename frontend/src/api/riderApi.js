import api from "./api.js";

export async function fetchRiderPortal(preview, signal) {
  const { data } = await api.get(preview ? "/rider/preview" : "/rider/portal", { signal });
  // Fail closed if a future backend accidentally serves operational data to this preview UI.
  if (!data.success || data.operationalEnabled !== false || !["preview", "disabled"].includes(data.mode)
      || !data.profile?.id || !Array.isArray(data.deliveries)
      || (data.mode === "disabled" && data.deliveries.length)
      || data.deliveries.some(row => row.synthetic !== true || row.riderId !== data.profile.id)) {
    throw new Error("Unexpected rider preview response. Live data has not been displayed.");
  }
  return data;
}
