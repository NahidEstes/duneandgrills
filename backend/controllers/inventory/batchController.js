import { getBatchSnapshots } from "../../services/inventoryBatchService.js";
import { escapeRegex, parsePagination } from "../../utils/inventoryValidation.js";

const endOfDay = (date) => {
  const value = new Date(date);
  value.setUTCHours(23, 59, 59, 999);
  return value;
};

export const listBatches = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query, 25);
    const now = new Date();
    const expiryEnd = new Date(now);
    expiryEnd.setUTCDate(expiryEnd.getUTCDate() + Math.max(1, Number(req.query.expiryDays) || 7));
    const search = req.query.search?.trim();
    const expression = search ? new RegExp(escapeRegex(search), "i") : null;
    let rows = await getBatchSnapshots({ includeDepleted: ["depleted", "all"].includes(req.query.status) });

    rows = rows.filter((batch) => {
      if (req.query.item && String(batch.item?._id || batch.item) !== String(req.query.item)) return false;
      if (req.query.supplier && String(batch.supplier?._id || batch.supplier) !== String(req.query.supplier)) return false;
      if (expression && ![batch.lotNumber, batch.item?.name, batch.item?.sku].some((value) => expression.test(value || ""))) return false;
      const expiry = batch.expiryDate ? new Date(batch.expiryDate) : null;
      if (req.query.status === "active" && Number(batch.remainingQuantity) <= 0) return false;
      if (req.query.status === "depleted" && Number(batch.remainingQuantity) > 0) return false;
      if (req.query.status === "expired" && (!expiry || expiry >= now || Number(batch.remainingQuantity) <= 0)) return false;
      if (req.query.status === "expiring" && (!expiry || expiry < now || expiry > expiryEnd || Number(batch.remainingQuantity) <= 0)) return false;
      if (req.query.from && (!expiry || expiry < new Date(req.query.from))) return false;
      if (req.query.to && (!expiry || expiry > endOfDay(req.query.to))) return false;
      return true;
    });

    rows.sort((left, right) => {
      const leftExpiry = left.expiryDate ? new Date(left.expiryDate).getTime() : Number.MAX_SAFE_INTEGER;
      const rightExpiry = right.expiryDate ? new Date(right.expiryDate).getTime() : Number.MAX_SAFE_INTEGER;
      return leftExpiry - rightExpiry || new Date(left.receivedAt) - new Date(right.receivedAt);
    });

    const summary = rows.reduce((result, batch) => {
      const remaining = Number(batch.remainingQuantity || 0);
      const expiry = batch.expiryDate ? new Date(batch.expiryDate) : null;
      if (remaining > 0) result.active += 1;
      else result.depleted += 1;
      if (remaining > 0 && expiry && expiry < now) result.expired += 1;
      else if (remaining > 0 && expiry && expiry <= expiryEnd) result.expiring += 1;
      result.stockValue += remaining * Number(batch.unitCost || 0);
      return result;
    }, { active: 0, depleted: 0, expired: 0, expiring: 0, stockValue: 0 });
    summary.stockValue = Number(summary.stockValue.toFixed(2));

    const total = rows.length;
    const start = (page - 1) * limit;
    res.json({
      success: true,
      data: rows.slice(start, start + limit),
      summary,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      currency: "SAR",
    });
  } catch (error) {
    next(error);
  }
};
