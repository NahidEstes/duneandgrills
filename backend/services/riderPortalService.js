import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { riderConfiguration } from "../config/rider.js";

const failure = (status, message) => Object.assign(new Error(message), { status });

// Intentionally no Order, payment, stock, notification or write-capable service imports.
export function buildRiderPortal(user, { preview = false, config = riderConfiguration() } = {}) {
  if (!user?._id) throw failure(401, "Staff sign-in required.");
  if (!hasCapability(user.role, CAPABILITIES.RIDER_PORTAL_READ)) throw failure(403, "Rider access required.");
  if (preview && !config.previewEnabled) throw failure(403, "Isolated development preview is disabled.");
  const profile = { id: String(user._id), name: user.name, employeeId: user.employeeId || null,
    role: user.role, email: user.email || "", phone: user.phone || "" };
  const deliveries = preview ? [
    { id: "preview-a", orderNumber: "PREVIEW-A", riderId: profile.id, synthetic: true,
      deliveryStatus: "assigned", restaurantStatus: "ready", customerName: "Sample recipient A",
      address: "Synthetic delivery address — not a real destination", paymentStatus: "pending",
      amountToCollect: 42, timeLabel: "Sample delivery • no real timestamp" },
    { id: "preview-b", orderNumber: "PREVIEW-B", riderId: profile.id, synthetic: true,
      deliveryStatus: "assigned", restaurantStatus: "preparing", customerName: "Sample recipient B",
      address: "Synthetic delivery address — not a real destination", paymentStatus: "paid",
      amountToCollect: 0, timeLabel: "Sample delivery • no real timestamp" },
  ] : [];
  return { mode: preview ? "preview" : "disabled", operationalEnabled: false,
    previewAvailable: config.previewEnabled, profile, availability: null, deliveries, history: [],
    counts: { active: preview ? deliveries.length : null, deliveredToday: preview ? 0 : null } };
}
