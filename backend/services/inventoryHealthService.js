import InventoryItem from "../models/InventoryItem.js";
import InventoryBatch from "../models/InventoryBatch.js";
import InventorySettings from "../models/InventorySettings.js";
import { calculateSaleableInventory, expiryDayStart, hasSaleableBatchQuality, inventoryUsability, isExpiredInventory } from "./inventoryEligibilityService.js";
import { ADMIN_DAY_MS } from "../utils/adminDate.js";

export const INVENTORY_HEALTH_FILTERS = Object.freeze(["low", "out", "expiring", "blocked", "expired", "quarantined", "damaged", "unknown_expiry", "unallocated", "unknown_quality"]);
export const INVENTORY_HEALTH_DESTINATIONS = Object.freeze({
  lowStock: "/inventory/stock-items?status=low", outOfStock: "/inventory/stock-items?status=out",
  expiringItems: "/inventory/stock-items?status=expiring", blockedItems: "/inventory/stock-items?status=blocked",
  expiredItems: "/inventory/stock-items?status=expired", quarantinedItems: "/inventory/stock-items?status=quarantined",
  damagedItems: "/inventory/stock-items?status=damaged", unknownExpiryItems: "/inventory/stock-items?status=unknown_expiry",
  unallocatedItems: "/inventory/stock-items?status=unallocated",
  unknownQualityItems: "/inventory/stock-items?status=unknown_quality",
  pendingPurchaseOrders: "/inventory/purchase-orders?status=pending", openPurchasingActions: "/inventory/purchasing-actions?state=active",
});

export function calculateInventoryHealth(items, batches, { now = new Date(), expiryAlertDays = 7 } = {}) {
  const byItem = new Map();
  for (const batch of batches) {
    const id = String(batch.item?._id || batch.item);
    if (!byItem.has(id)) byItem.set(id, []);
    byItem.get(id).push(batch);
  }
  const expiryEndExclusive = new Date(expiryDayStart(now).getTime() + (expiryAlertDays + 1) * ADMIN_DAY_MS);
  const rows = items.map(item => {
    const history = byItem.get(String(item._id)) || [];
    const stock = calculateSaleableInventory(item, history, now);
    const remaining = history.filter(batch => Number(batch.remainingQuantity) > 0);
    const sources = history.length ? remaining : stock.physicalStock > 0 ? [{ expiryDate: item.expiryDate, remainingQuantity: stock.physicalStock }] : [];
    const reasons = new Set();
    for (const source of sources) {
      if (isExpiredInventory(source.expiryDate, now)) reasons.add("expired");
      if (["quarantined", "damaged"].includes(source.qualityStatus)) reasons.add(source.qualityStatus);
      if (!hasSaleableBatchQuality(source) && !["quarantined", "damaged"].includes(source.qualityStatus)) reasons.add("unknown_quality");
      if (item.tracksExpiry && !source.expiryDate) reasons.add("unknown_expiry");
      const usability = inventoryUsability(source, item, now);
      if (usability !== "usable") reasons.add(usability);
    }
    const allocatedPhysical = remaining.reduce((sum, batch) => sum + Number(batch.remainingQuantity), 0);
    if (history.length && stock.physicalStock - allocatedPhysical > 0.0000005) reasons.add("unallocated");
    const expiring = sources.filter(source => source.expiryDate && !isExpiredInventory(source.expiryDate, now) && new Date(source.expiryDate) < expiryEndExclusive);
    const health = {
      low: stock.saleableStock > 0 && stock.saleableStock <= Number(item.reorderLevel || 0),
      out: stock.saleableStock === 0,
      expiring: expiring.length > 0,
      blocked: reasons.size > 0,
      ...Object.fromEntries(["expired", "quarantined", "damaged", "unknown_expiry", "unallocated", "unknown_quality"].map(reason => [reason, reasons.has(reason)])),
    };
    return { ...item, ...stock, stockHealth: health, blockedReasons: [...reasons], expiringDates: expiring.map(source => source.expiryDate) };
  });
  const active = rows.filter(item => item.isActive !== false);
  const count = filter => active.filter(item => item.stockHealth[filter]).length;
  return { rows, summary: {
    lowStock: count("low"), outOfStock: count("out"), expiringItems: count("expiring"), blockedItems: count("blocked"),
    expiredItems: count("expired"), quarantinedItems: count("quarantined"), damagedItems: count("damaged"),
    unknownExpiryItems: count("unknown_expiry"), unallocatedItems: count("unallocated"), unknownQualityItems: count("unknown_quality"), expiryAlertDays,
    metricUnit: "unique active inventory items", timezone: "Asia/Riyadh", destinations: INVENTORY_HEALTH_DESTINATIONS,
  } };
}

// Constant query count, not one stock lookup per item. Keep depleted batch history for legacy safety.
export async function getInventoryHealth({ items = null, now = new Date() } = {}) {
  const [rows, settings] = await Promise.all([
    items || InventoryItem.find({ isActive: true }).select("currentStock reorderLevel tracksExpiry expiryDate isActive unit").lean(),
    InventorySettings.findOne({ key: "default" }).select("expiryAlertDays").lean(),
  ]);
  const batches = rows.length ? await InventoryBatch.find({ item: { $in: rows.map(item => item._id) } }).select("item remainingQuantity expiryDate qualityStatus").lean() : [];
  const expiryAlertDays = settings?.expiryAlertDays ?? InventorySettings.schema.path("expiryAlertDays").defaultValue;
  return calculateInventoryHealth(rows, batches, { now, expiryAlertDays });
}
