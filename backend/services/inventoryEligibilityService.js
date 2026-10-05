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

export async function getSaleableInventory(item, { now = new Date(), session = null } = {}) {
  const anyBatch = await InventoryBatch.exists({ item: item._id }).session(session);
  const eligible = anyBatch
    ? await InventoryBatch.find(eligibleBatchFilter(item, now)).select("remainingQuantity").session(session).lean()
    : [];
  const physicalStock = Math.max(0, Number(item.currentStock || 0));
  // Compatibility applies ONLY when there has never been batch data, including depleted batches.
  const legacyStockFallback = !anyBatch;
  const legacyUsable = inventoryUsability({ expiryDate: item.expiryDate }, item, now) === "usable";
  const usable = anyBatch ? eligible.reduce((sum, batch) => sum + Number(batch.remainingQuantity), 0) : legacyUsable ? physicalStock : 0;
  const saleableStock = round(Math.min(physicalStock, usable));
  return { physicalStock: round(physicalStock), saleableStock, nonSaleableStock: round(physicalStock - saleableStock), hasBatchData: Boolean(anyBatch), legacyStockFallback };
}
