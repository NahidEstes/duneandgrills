import { riderConfiguration } from "../config/rider.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { deliveryError } from "./deliveryContractService.js";

export function adminDeliveryPreview(actor, id) {
  if (!hasCapability(actor?.role, CAPABILITIES.DELIVERY_MANAGE)) throw deliveryError("Delivery management permission required", 403);
  if (!riderConfiguration().previewEnabled) throw deliveryError("Isolated development preview is disabled", 403);
  const deliveries = ["A", "B", "C"].map((suffix, index) => ({
    id: `preview-${suffix.toLowerCase()}`, orderNumber: `PREVIEW-${suffix}`, synthetic: true,
    customerName: `Sample recipient ${suffix}`, restaurantStatus: "ready", deliveryStatus: index === 1 ? "assigned" : "unassigned",
    riderName: index === 1 ? "Sample rider A" : null, riderId: index === 1 ? "preview-rider-a" : null,
    amountToCollect: index === 2 ? 0 : 42, paymentStatus: index === 2 ? "paid" : "pending", revision: 0,
    cashReport: { status: "none", amount: null }, canConfirmCash: false,
  }));
  if (id) { const delivery = deliveries.find(row => row.id === id); if (!delivery) throw deliveryError("Preview delivery unavailable", 404); return { ...delivery, customer: { name: delivery.customerName, phone: "", address: "Synthetic preview address" }, deliveryNote: "Synthetic note — no customer contact", items: [{ name: "Sample menu item", quantity: 1, lineTotal: 42 }], orderTotal: 42, pickupInstructions: "Read-only synthetic preview" }; }
  return { success: true, mode: "preview", operationalEnabled: false, workflowEnabled: false,
    deliveries, counts: { unassigned: 2, assigned: 1, picked_up: 0, delivered: 0, issue: 0 },
    riders: [{ id: "preview-rider-a", name: "Sample rider A", available: true, activeCount: 1 }, { id: "preview-rider-b", name: "Sample rider B", available: false, activeCount: 0 }],
    pagination: { page: 1, limit: 20, total: 3 } };
}
