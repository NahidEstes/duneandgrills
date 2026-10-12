import RestaurantSettings from "../models/RestaurantSettings.js";
import { riderConfiguration } from "../config/rider.js";
import { deliveryError } from "./deliveryContractService.js";
import { recordAuditLog } from "./auditLogService.js";
import { runInventoryTransaction } from "./inventoryStockService.js";

export async function getRiderAccess(session = null) {
  const stored = await RestaurantSettings.findOne({ key: "default" }).select("riderDelivery").session(session).lean();
  const isolated = riderConfiguration();
  const operationalEnabled = stored?.riderDelivery?.enabled === true;
  return { operationalEnabled, workflowEnabled: isolated.workflowEnabled, previewAvailable: isolated.previewEnabled,
    mode: operationalEnabled ? "operational" : isolated.workflowEnabled ? "rehearsal" : "disabled" };
}

export async function assertDeliveryEnabled(session = null, { lock = false } = {}) {
  const config = await getRiderAccess(session);
  if (!config.operationalEnabled && !config.workflowEnabled) throw Object.assign(deliveryError("Delivery rider is disabled. An administrator can enable it in Restaurant Settings.", 503), { code: "LIVE_DELIVERY_DISABLED" });
  if (lock && config.operationalEnabled) {
    // A concurrent toggle writes this same singleton. MongoDB retries/aborts the
    // transaction rather than committing a delivery write against stale enablement.
    const result = await RestaurantSettings.updateOne({ key: "default", "riderDelivery.enabled": true },
      { $inc: { riderOperationRevision: 1 } }, { session, timestamps: false });
    if (!result.matchedCount) throw Object.assign(deliveryError("Delivery rider was disabled; reload before acting.", 503), { code: "LIVE_DELIVERY_DISABLED" });
  }
  return config;
}

export async function setRiderDeliverySetting(actor, payload) {
  if (actor?.role !== "admin") throw deliveryError("Only an administrator can enable or disable delivery riders", 403);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || Object.keys(payload).some(key => !["enabled", "expectedRevision"].includes(key))
      || typeof payload.enabled !== "boolean" || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0) throw deliveryError("Provide enabled and the current settings revision");
  return runInventoryTransaction(async session => {
    if (!session) throw deliveryError("Delivery settings require a MongoDB replica set", 503);
    let stored = await RestaurantSettings.findOne({ key: "default" }).session(session);
    if (!stored) [stored] = await RestaurantSettings.create([{ key: "default" }], { session });
    const before = stored.riderDelivery?.enabled === true;
    const revision = stored.riderDelivery?.revision || 0;
    if (revision !== payload.expectedRevision) throw deliveryError("Delivery settings changed; reload before saving", 409);
    if (before === payload.enabled) return { enabled: before, revision };
    stored.set("riderDelivery", { enabled: payload.enabled, revision: revision + 1 });
    stored.updatedBy = actor._id;
    await stored.save({ session });
    await recordAuditLog({ actor, action: "RIDER_DELIVERY_SETTING_CHANGED", entityType: "RestaurantSettings", entityId: stored._id,
      entityLabel: "Delivery rider enablement", before: { enabled: before }, after: { enabled: payload.enabled },
    }, { session });
    return { enabled: payload.enabled, revision: revision + 1 };
  });
}
