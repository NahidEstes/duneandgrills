import Counter from "../models/Counter.js";
import InventoryBatch from "../models/InventoryBatch.js";
import InventoryItem from "../models/InventoryItem.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { eligibleBatchFilter, inventoryUsability } from "./inventoryEligibilityService.js";

const sessionOptions = (session) => (session ? { session } : {});

const nextLotNumber = async (session = null) => {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const counter = await Counter.findOneAndUpdate(
    { _id: `inventory-batch-${date}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, ...sessionOptions(session) }
  );
  return `LOT-${date}-${String(counter.seq).padStart(4, "0")}`;
};

export const ensureLegacyBatch = async (item, session = null) => {
  // Never manufacture legacy stock/expiry from a gap after real batch history exists.
  if (await InventoryBatch.exists({ item: item._id }).session(session || null)) return null;
  const gap = Number(Number(item.currentStock).toFixed(6));
  if (gap <= 0) return null;

  const [created] = await InventoryBatch.create([
    {
      item: item._id,
      lotNumber: `LEGACY-${item.sku}`,
      receivedQuantity: gap,
      remainingQuantity: gap,
      receivedAt: item.createdAt || new Date(),
      expiryDate: item.expiryDate || null,
      unitCost: Number(item.unitCost || 0),
      supplier: item.supplier || null,
      source: "LEGACY",
      purchaseQuantity: gap,
      purchaseUnit: item.unit,
      conversionFactor: 1,
      isLegacy: true,
    },
  ], sessionOptions(session));
  return created;
};

export const createInventoryBatch = async ({
  item,
  quantity,
  lotNumber,
  receivedAt,
  expiryDate,
  unitCost,
  brand,
  supplier,
  purchaseOrder,
  source,
  purchaseQuantity,
  purchaseUnit,
  conversionFactor = 1,
}, session = null) => {
  const normalizedQuantity = Number(Number(quantity).toFixed(6));
  const [batch] = await InventoryBatch.create([
    {
      item: item._id,
      lotNumber: String(lotNumber || await nextLotNumber(session)).trim().toUpperCase(),
      receivedQuantity: normalizedQuantity,
      remainingQuantity: normalizedQuantity,
      receivedAt: receivedAt || new Date(),
      expiryDate: expiryDate || null,
      unitCost: Number(unitCost ?? item.unitCost ?? 0),
      brand: String(brand || "").trim(),
      supplier: supplier || item.supplier || null,
      purchaseOrder: purchaseOrder || null,
      source,
      purchaseQuantity: purchaseQuantity == null ? normalizedQuantity : Number(purchaseQuantity),
      purchaseUnit: purchaseUnit || item.unit,
      conversionFactor: Number(conversionFactor) || 1,
    },
  ], sessionOptions(session));
  return {
    allocations: [{
      batch: batch._id,
      lotNumber: batch.lotNumber,
      quantity: normalizedQuantity,
      expiryDate: batch.expiryDate,
      unitCost: batch.unitCost,
      brand: batch.brand || "",
    }],
    createdBatchIds: [batch._id],
    deltas: [],
  };
};

export const consumeInventoryBatches = async ({ item, quantity, saleOnly = false, now = new Date() }, session = null) => {
  await ensureLegacyBatch(item, session);
  let needed = Number(Number(quantity).toFixed(6));
  const batches = await InventoryBatch.find(saleOnly ? eligibleBatchFilter(item, now) : { item: item._id, remainingQuantity: { $gt: 0 } })
    .sort({ fefoDate: 1, receivedAt: 1, _id: 1 })
    .session(session || null);
  const available = batches.reduce((sum, batch) => sum + Number(batch.remainingQuantity || 0), 0);
  if (Number(available.toFixed(6)) < needed) {
    if (saleOnly) throw new ValidationError(`Insufficient saleable stock for ${item.name}: needs ${needed} ${item.unit}, only ${Number(available.toFixed(6))} saleable (${item.currentStock} physical). Expired, quarantined, damaged and unknown-expiry tracked stock cannot be sold`);
    throw new ValidationError(`Batch balances are short by ${Number((needed - available).toFixed(6))} ${item.unit}. Reconcile this item before continuing`);
  }
  const allocations = [];
  const deltas = [];

  try {
    for (const batch of batches) {
      if (needed <= 0) break;
      const used = Number(Math.min(needed, batch.remainingQuantity).toFixed(6));
      if (used <= 0) continue;
      const updated = await InventoryBatch.findOneAndUpdate(
        { ...(saleOnly ? eligibleBatchFilter(item, now) : {}), _id: batch._id, remainingQuantity: batch.remainingQuantity },
        { $inc: { remainingQuantity: -used } },
        { new: true, ...sessionOptions(session) }
      );
      if (!updated) throw new ValidationError("Batch stock changed while this operation was being saved. Please try again");
      allocations.push({
        batch: batch._id,
        lotNumber: batch.lotNumber,
        quantity: used,
        expiryDate: batch.expiryDate,
        unitCost: batch.unitCost,
        brand: batch.brand || "",
      });
      deltas.push({ batchId: batch._id, delta: -used });
      needed = Number((needed - used).toFixed(6));
    }
  } catch (error) {
    if (!session) {
      for (const change of [...deltas].reverse()) {
        await InventoryBatch.updateOne({ _id: change.batchId }, { $inc: { remainingQuantity: -change.delta } });
      }
    }
    throw error;
  }

  if (needed > 0) throw new ValidationError(`Batch balances are short by ${needed} ${item.unit}. Reconcile this item before continuing`);
  return { allocations, createdBatchIds: [], deltas };
};

export const restoreInventoryBatches = async ({ item, allocations }, session = null) => {
  const restored = [];
  const deltas = [];
  const createdBatchIds = [];
  for (const allocation of allocations || []) {
    const quantity = Number(allocation.quantity);
    const batch = allocation.batch
      ? await InventoryBatch.findByIdAndUpdate(
          allocation.batch,
          { $inc: { remainingQuantity: quantity } },
          { new: true, ...sessionOptions(session) }
        )
      : null;
    if (!batch) {
      const created = await createInventoryBatch({
        item,
        quantity,
        lotNumber: allocation.lotNumber,
        expiryDate: allocation.expiryDate,
        unitCost: allocation.unitCost,
        brand: allocation.brand || "",
        source: "RESTORATION",
        purchaseQuantity: quantity,
        purchaseUnit: item.unit,
        conversionFactor: 1,
      }, session);
      restored.push(...created.allocations);
      createdBatchIds.push(...created.createdBatchIds);
      continue;
    }
    restored.push({
      batch: batch._id,
      lotNumber: batch.lotNumber,
      quantity,
      expiryDate: batch.expiryDate,
      unitCost: batch.unitCost,
      brand: batch.brand || "",
    });
    deltas.push({ batchId: batch._id, delta: quantity });
  }
  return { allocations: restored, createdBatchIds, deltas };
};

export const updateItemNextExpiry = async (itemId, session = null) => {
  const batch = await InventoryBatch.findOne({
    item: itemId,
    remainingQuantity: { $gt: 0 },
    expiryDate: { $ne: null },
  }).sort({ expiryDate: 1, receivedAt: 1 }).session(session || null).lean();
  return batch?.expiryDate || null;
};

export const rollbackBatchChanges = async (changes) => {
  if (!changes) return;
  if (changes.createdBatchIds?.length) {
    await InventoryBatch.deleteMany({ _id: { $in: changes.createdBatchIds } });
  }
  for (const change of [...(changes.deltas || [])].reverse()) {
    await InventoryBatch.updateOne({ _id: change.batchId }, { $inc: { remainingQuantity: -change.delta } });
  }
};

export const getBatchSnapshots = async ({ includeDepleted = true, now = new Date() } = {}) => {
  const [items, batches] = await Promise.all([
    InventoryItem.find({ isActive: true })
      .populate("category", "name color")
      .populate("supplier", "name code")
      .lean(),
    InventoryBatch.find({})
      .populate({ path: "item", select: "name sku unit category storageLocation isActive tracksExpiry", populate: { path: "category", select: "name color" } })
      .populate("supplier", "name code")
      .populate("purchaseOrder", "orderNumber")
      .sort({ fefoDate: 1, receivedAt: 1 })
      .lean(),
  ]);

  const trackedByItem = new Map();
  for (const batch of batches) {
    const itemId = String(batch.item?._id || batch.item);
    trackedByItem.set(itemId, (trackedByItem.get(itemId) || 0) + Number(batch.remainingQuantity || 0));
  }
  const synthetic = items.flatMap((item) => {
    const gap = Number((Number(item.currentStock) - Number(trackedByItem.get(String(item._id)) || 0)).toFixed(6));
    if (gap <= 0) return [];
    return [{
      _id: `legacy-${item._id}`,
      item,
      lotNumber: `LEGACY-${item.sku}`,
      receivedQuantity: gap,
      remainingQuantity: gap,
      receivedAt: item.createdAt,
      expiryDate: trackedByItem.has(String(item._id)) ? null : item.expiryDate || null,
      unitCost: Number(item.unitCost || 0),
      supplier: item.supplier || null,
      purchaseOrder: null,
      source: "LEGACY",
      purchaseQuantity: gap,
      purchaseUnit: item.unit,
      conversionFactor: 1,
      isLegacy: true,
      isSynthetic: true,
      unallocated: trackedByItem.has(String(item._id)),
    }];
  });
  return [...batches, ...synthetic].filter(batch => includeDepleted || Number(batch.remainingQuantity) > 0).map(batch => {
    const usability = batch.unallocated ? "unallocated" : inventoryUsability(batch, batch.item || {}, now);
    return { ...batch, usability, saleableQuantity: usability === "usable" ? batch.remainingQuantity : 0 };
  });
};
