import InventoryBatch from "../models/InventoryBatch.js";
import { parseRiyadhDate } from "../utils/adminDate.js";

const round = value => Number(Number(value || 0).toFixed(6));
const riyadhDay = date => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));

// Expiry is a restaurant calendar date, inclusive through that Riyadh day.
export const expiryDayStart = (now = new Date()) => parseRiyadhDate(riyadhDay(now));
export const isExpiredInventory = (expiryDate, now = new Date()) => Boolean(expiryDate && new Date(expiryDate) < expiryDayStart(now));

export const eligibleBatchFilter = (item, now = new Date()) => ({
  item: item._id,
  remainingQuantity: { $gt: 0 },
  $and: [
    { $or: [{ qualityStatus: "usable" }, { qualityStatus: { $exists: false } }] },
    item.tracksExpiry
      ? { expiryDate: { $gte: expiryDayStart(now) } }
      : { $or: [{ expiryDate: null }, { expiryDate: { $gte: expiryDayStart(now) } }] },
  ],
});

export const inventoryUsability = (batch, item, now = new Date()) => {
  if (batch.qualityStatus && batch.qualityStatus !== "usable") return batch.qualityStatus;
  if (isExpiredInventory(batch.expiryDate, now)) return "expired";
  if (item.tracksExpiry && !batch.expiryDate) return "unknown_expiry";
  return "usable";
};

// Match eligibleBatchFilter exactly, including historical rows with a missing quality field.
export const hasSaleableBatchQuality = batch => batch.qualityStatus === undefined || batch.qualityStatus === "usable";

// The supplied array must include depleted batches: any batch history disables legacy fallback.
export const calculateSaleableInventory = (item, batches, now = new Date()) => {
  const physicalStock = Math.max(0, Number(item.currentStock || 0));
  const usable = batches.length
    ? batches.reduce((sum, batch) => sum + (Number(batch.remainingQuantity) > 0 && hasSaleableBatchQuality(batch) && inventoryUsability(batch, item, now) === "usable" ? Number(batch.remainingQuantity) : 0), 0)
    : inventoryUsability({ expiryDate: item.expiryDate }, item, now) === "usable" ? physicalStock : 0;
  const saleableStock = round(Math.min(physicalStock, usable));
  return { physicalStock: round(physicalStock), saleableStock, nonSaleableStock: round(physicalStock - saleableStock), hasBatchData: batches.length > 0, legacyStockFallback: batches.length === 0 };
};

export async function getSaleableInventory(item, { now = new Date(), session = null } = {}) {
  const anyBatch = await InventoryBatch.exists({ item: item._id }).session(session);
  const eligible = anyBatch
    ? await InventoryBatch.find(eligibleBatchFilter(item, now)).select("remainingQuantity expiryDate qualityStatus").session(session).lean()
    : [];
  // An empty eligible result must not erase genuine (possibly depleted) batch history.
  return calculateSaleableInventory(item, anyBatch && !eligible.length ? [{ remainingQuantity: 0 }] : eligible, now);
}
