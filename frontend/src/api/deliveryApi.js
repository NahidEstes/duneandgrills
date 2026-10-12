import api from "./api.js";

const safe = (data, { preview = false, rehearsal = false } = {}) => {
  if (!data.success || !(preview ? data.mode === "preview" : data.mode === "operational" || (rehearsal && data.mode === "rehearsal"))
      || data.operationalEnabled !== (data.mode === "operational")) throw new Error("Unexpected delivery response; reload the delivery workspace.");
  return data;
};
export async function fetchDeliveryManagement({ preview, rehearsal, status = "all", search = "", page = 1 }, signal) {
  if (preview) return safe((await api.get("/deliveries/preview", { signal })).data, { preview });
  const config = (await api.get("/deliveries/config", { signal })).data;
  if (!config.success || typeof config.operationalEnabled !== "boolean" || typeof config.workflowEnabled !== "boolean") throw new Error("Delivery configuration unavailable. Retry before acting.");
  if (!config.operationalEnabled && !(rehearsal && config.workflowEnabled)) return { mode: "disabled", operationalEnabled: false, workflowAvailable: config.workflowEnabled, previewAvailable: config.previewAvailable, deliveries: [], riders: [], counts: null, pagination: null };
  const [list, riders] = await Promise.all([api.get("/deliveries", { params: { status, search, page, limit: 20 }, signal }), api.get("/deliveries/riders", { signal }).catch(error => {
    if (error.response?.status === 403) return { data: { data: [] } }; throw error;
  })]);
  return { ...safe(list.data, { rehearsal }), riders: riders.data.data };
}
export async function fetchDeliveryDetails(id, { preview, rehearsal, admin = false }, signal) {
  const root = admin ? "/deliveries" : "/rider";
  const path = admin ? preview ? `${root}/preview/${encodeURIComponent(id)}` : `${root}/${encodeURIComponent(id)}`
    : preview ? `${root}/preview/deliveries/${encodeURIComponent(id)}` : `${root}/workflow/deliveries/${encodeURIComponent(id)}`;
  return safe((await api.get(path, { signal })).data, { preview, rehearsal });
}
export async function deliveryAction(id, action, payload, { admin = false } = {}) {
  const root = admin ? "/deliveries" : "/rider/workflow/deliveries";
  return (await api.post(`${root}/${encodeURIComponent(id)}/${action}`, payload)).data;
}
export async function updateRiderAvailability(payload) { return (await api.post("/rider/workflow/availability", payload)).data; }
export async function findEnrollmentOrder(orderNumber, signal) { return (await api.get("/deliveries/enrollment-order", { params: { orderNumber }, signal })).data.data; }
export async function enrollRestaurantDelivery(id, payload) { return (await api.post(`/deliveries/orders/${id}/enroll`, payload)).data; }
export async function saveRiderDeliverySetting(payload) { return (await api.patch("/settings/rider-delivery", payload)).data.data; }
