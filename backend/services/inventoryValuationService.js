import InventoryBatch from "../models/InventoryBatch.js";
import InventoryItem from "../models/InventoryItem.js";
import "../models/InventoryCategory.js";
import "../models/Supplier.js";

const EPSILON = 0.000001;
const money = (value) => Number(Number(value || 0).toFixed(2));

export const buildInventoryValuation = async ({ itemIds = null } = {}) => {
  const itemFilter = { isActive: true };
  if (itemIds?.length) itemFilter._id = { $in: itemIds };
  const items = await InventoryItem.find(itemFilter).populate("category", "name color").populate("supplier", "name code").sort({ name: 1 }).lean();
  const ids = items.map((item) => item._id);
  const batches = ids.length ? await InventoryBatch.find({ item: { $in: ids } }).lean() : [];
  const batchesByItem = new Map();
  for (const batch of batches) {
    const key = String(batch.item);
    if (!batchesByItem.has(key)) batchesByItem.set(key, []);
    batchesByItem.get(key).push(batch);
  }

  const rows = items.map((item) => {
    const itemBatches = batchesByItem.get(String(item._id)) || [];
    const activeBatches = itemBatches.filter((batch) => Number(batch.remainingQuantity) > EPSILON);
    const isBatchManaged = itemBatches.length > 0;
    const batchQuantity = activeBatches.reduce((sum, batch) => sum + Number(batch.remainingQuantity || 0), 0);
    const missingCostBatches = activeBatches.filter((batch) => !Number.isFinite(Number(batch.unitCost)) || Number(batch.unitCost) <= 0);
    const batchValue = activeBatches.reduce((sum, batch) => {
      const cost = Number(batch.unitCost);
      return Number.isFinite(cost) && cost > 0 ? sum + Number(batch.remainingQuantity) * cost : sum;
    }, 0);
    const fallbackCostValid = Number.isFinite(Number(item.unitCost)) && Number(item.unitCost) > 0;
    const currentStock = Number(item.currentStock || 0);
    const mismatch = isBatchManaged && Math.abs(batchQuantity - currentStock) > EPSILON;
    const missingCost = currentStock > EPSILON && (isBatchManaged ? missingCostBatches.length > 0 : !fallbackCostValid);
    const inventoryValue = isBatchManaged ? batchValue : (fallbackCostValid ? currentStock * Number(item.unitCost) : 0);
    return {
      ...item,
      inventoryValue: money(inventoryValue),
      valuationMethod: isBatchManaged ? "batch" : "item_unit_cost_fallback",
      valuationComplete: !missingCost && !mismatch,
      valuedQuantity: isBatchManaged ? Number(batchQuantity.toFixed(6)) : currentStock,
      batchQuantity: Number(batchQuantity.toFixed(6)),
      stockMismatch: mismatch,
      quantityDifference: mismatch ? Number((currentStock - batchQuantity).toFixed(6)) : 0,
      missingCost,
      missingCostBatchCount: missingCostBatches.length,
      activeBatchCount: activeBatches.length,
    };
  });

  const categoryMap = new Map();
  for (const row of rows) {
    const key = String(row.category?._id || "uncategorized");
    const current = categoryMap.get(key) || { categoryId: row.category?._id || null, category: row.category?.name || "Uncategorized", color: row.category?.color || "#64748b", value: 0, count: 0, missingCostItems: 0, mismatchWarnings: 0 };
    current.value += row.inventoryValue;
    current.count += 1;
    if (row.missingCost) current.missingCostItems += 1;
    if (row.stockMismatch) current.mismatchWarnings += 1;
    categoryMap.set(key, current);
  }
  const totalValue = money(rows.reduce((sum, row) => sum + row.inventoryValue, 0));
  const categoryDistribution = [...categoryMap.values()].map((row) => ({
    ...row,
    value: money(row.value),
    percentage: totalValue ? Number(((row.value / totalValue) * 100).toFixed(1)) : 0,
  })).sort((left, right) => right.value - left.value);
  return {
    rows,
    categoryDistribution,
    summary: {
      inventoryValue: totalValue,
      batchValuedItems: rows.filter((row) => row.valuationMethod === "batch").length,
      fallbackValuedItems: rows.filter((row) => row.valuationMethod === "item_unit_cost_fallback").length,
      missingCostItems: rows.filter((row) => row.missingCost).length,
      mismatchWarnings: rows.filter((row) => row.stockMismatch).length,
      completeItems: rows.filter((row) => row.valuationComplete).length,
      totalItems: rows.length,
      coveragePercent: rows.length ? Number((rows.filter((row) => row.valuationComplete).length / rows.length * 100).toFixed(1)) : 100,
    },
  };
};
