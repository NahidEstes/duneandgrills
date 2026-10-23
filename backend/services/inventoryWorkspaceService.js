import InventoryBatch from "../models/InventoryBatch.js";
import { calculateSaleableInventory, hasSaleableBatchQuality, inventoryUsability } from "./inventoryEligibilityService.js";

const round = value => Number(value.toFixed(6));
// Mutually exclusive evidence buckets. Quality takes precedence over expiry;
// missing quality differs from explicit null, matching the eligibility service.
export function stockBreakdown(item, batches, now = new Date()) {
  const stock = calculateSaleableInventory(item, batches, now);
  const buckets = {};
  const sources = batches.length ? batches : [{ remainingQuantity: Math.max(0, item.currentStock), expiryDate: item.expiryDate }];
  for (const batch of sources) {
    const quantity = Number(batch.remainingQuantity);
    if (!(quantity > 0)) continue;
    const reason = !hasSaleableBatchQuality(batch) ? (["quarantined", "damaged"].includes(batch.qualityStatus) ? batch.qualityStatus : "unknown_quality") : inventoryUsability(batch, item, now);
    buckets[reason] = round((buckets[reason] || 0) + quantity);
  }
  const evidencedQuantity = round(Object.values(buckets).reduce((sum, value) => sum + value, 0));
  const difference = round(Number(item.currentStock) - evidencedQuantity);
  return { ...stock, physicalStock: Number(item.currentStock), unit: item.unit, buckets, evidencedQuantity,
    reconciled: Math.abs(difference) < 0.000001 && item.currentStock >= 0,
    unallocatedQuantity: Math.max(0, difference), batchExcessQuantity: Math.max(0, -difference),
    basis: batches.length ? "saved_batches" : "legacy_item_evidence" };
}

export async function readStockBreakdown(item) {
  const batches = await InventoryBatch.find({ item: item._id }).select("remainingQuantity expiryDate qualityStatus").lean();
  return stockBreakdown(item, batches);
}
