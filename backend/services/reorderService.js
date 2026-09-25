import crypto from "crypto";
import InventoryBatch from "../models/InventoryBatch.js";
import InventoryItem from "../models/InventoryItem.js";
import InventorySettings from "../models/InventorySettings.js";
import PurchaseAutomationRun from "../models/PurchaseAutomationRun.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchasePriceHistory from "../models/PurchasePriceHistory.js";
import ReorderSuggestion from "../models/ReorderSuggestion.js";
import StockTransaction from "../models/StockTransaction.js";
import Supplier from "../models/Supplier.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { recordAuditLog } from "./auditLogService.js";
import { runInventoryTransaction } from "./inventoryStockService.js";
import { getPurchaseConfiguration, toBaseQuantity } from "./inventoryUnitService.js";
import { createPurchaseOrderInSession } from "./purchaseOrderService.js";

const quantity = (value) => Number(Number(value || 0).toFixed(6));
const money = (value) => Number(Number(value || 0).toFixed(2));
const ceilTo = (value, multiple) => quantity(Math.ceil((Number(value) - 1e-9) / Number(multiple)) * Number(multiple));
const signature = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const calculateReorderRecommendation = ({ usableOnHand = 0, reservedQuantity = 0, confirmedInbound = 0, reorderPoint = 0, targetStock = 0, safetyStock = 0, averageDailyUsage = null, leadTimeDays = 0, conversionFactor = 1, minimumOrderQuantity = 1, orderMultiple = 1 }) => {
  const projectedAvailable = quantity(usableOnHand - reservedQuantity + confirmedInbound);
  const demandAware = Number.isFinite(Number(averageDailyUsage)) && Number(averageDailyUsage) > 0;
  const leadTimeDemand = demandAware ? quantity(Number(averageDailyUsage) * Number(leadTimeDays)) : 0;
  const effectiveReorderPoint = quantity(Math.max(Number(reorderPoint), leadTimeDemand + Number(safetyStock)));
  const effectiveTarget = quantity(Math.max(Number(targetStock), Number(reorderPoint) + Number(safetyStock), demandAware ? leadTimeDemand + Number(safetyStock) : 0));
  const rawBaseQuantity = projectedAvailable <= effectiveReorderPoint ? quantity(Math.max(0, effectiveTarget - projectedAvailable)) : 0;
  const rawPurchaseQuantity = quantity(rawBaseQuantity / Number(conversionFactor));
  const moqApplied = rawPurchaseQuantity > 0 ? Math.max(rawPurchaseQuantity, Number(minimumOrderQuantity)) : 0;
  const finalPurchaseQuantity = moqApplied > 0 ? ceilTo(moqApplied, Number(orderMultiple)) : 0;
  return { projectedAvailable, leadTimeDemand, effectiveReorderPoint, effectiveTarget, rawBaseQuantity, rawPurchaseQuantity, moqApplied: quantity(moqApplied), finalPurchaseQuantity, finalBaseQuantity: quantity(toBaseQuantity(finalPurchaseQuantity, conversionFactor)), demandAware };
};

const getSettings = async (session = null) => {
  const query = InventorySettings.findOneAndUpdate({ key: "default" }, { $setOnInsert: { key: "default" } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  if (session) query.session(session);
  return query.lean();
};

export const resolveSuggestionPrice = async (itemId, supplierId, session = null) => {
  for (const [priceType, source] of [["invoiced", "posted_invoice"], ["received", "received"], ["approved", "approved"]]) {
    const row = await PurchasePriceHistory.findOne({ item: itemId, ...(supplierId ? { supplier: supplierId } : {}), priceType }).sort({ effectiveAt: -1 }).session(session || null).lean();
    if (row && Number(row.unitPrice) > 0) return { unitPrice: Number(row.unitPrice), source, reference: row._id };
  }
  return { unitPrice: null, source: "missing", reference: null };
};

export const collectReorderInputs = async (item, { now = new Date(), settings, session = null } = {}) => {
  const policy = settings?.purchasingAutomation || {};
  const lookbackDays = Number(policy.demandLookbackDays || 30);
  const lookbackStart = new Date(now.getTime() - lookbackDays * 86400000);
  const [batches, inboundOrders, usage] = await Promise.all([
    InventoryBatch.find({ item: item._id, remainingQuantity: { $gt: 0 }, $and: [{ $or: [{ qualityStatus: "usable" }, { qualityStatus: { $exists: false } }] }, { $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }] }] }).select("remainingQuantity").session(session || null).lean(),
    PurchaseOrder.find({ status: { $in: ["ordered", "partially_received"] }, "items.item": item._id }).select("items status").session(session || null).lean(),
    StockTransaction.aggregate([{ $match: { item: item._id, movementType: "STOCK_OUT", order: { $ne: null }, occurredAt: { $gte: lookbackStart, $lte: now } } }, { $group: { _id: null, quantity: { $sum: "$quantity" }, days: { $addToSet: { $dateToString: { date: "$occurredAt", format: "%Y-%m-%d" } } } } }]).session(session || null),
  ]);
  const hasBatchData = batches.length > 0 || Number(item.currentStock) === 0;
  const usableOnHand = hasBatchData ? batches.reduce((sum, row) => sum + Number(row.remainingQuantity), 0) : Number(item.currentStock || 0);
  const confirmedInbound = inboundOrders.reduce((sum, po) => sum + po.items.filter((line) => String(line.item) === String(item._id)).reduce((lineSum, line) => lineSum + Math.max(0, Number(line.quantity) - Number(line.receivedQuantity || 0)) * Number(line.conversionFactor || 1), 0), 0);
  const usageRow = usage[0];
  const reliableUsage = Boolean(usageRow && usageRow.days.length >= 3);
  const averageDailyUsage = reliableUsage ? quantity(Number(usageRow.quantity) / lookbackDays) : null;
  const { purchaseUnit, baseUnit, conversionFactor } = getPurchaseConfiguration(item);
  return { usableOnHand: quantity(usableOnHand), reservedQuantity: 0, confirmedInbound: quantity(confirmedInbound), averageDailyUsage, usageQuantity: quantity(usageRow?.quantity || 0), usageDays: usageRow?.days?.length || 0, reliableUsage, leadTimeDays: Number(item.leadTimeDays || item.supplier?.leadTimeDays || policy.defaultLeadTimeDays || 0), purchaseUnit, baseUnit, conversionFactor, legacyStockFallback: !hasBatchData };
};

export const calculateItemReorder = async (item, { now = new Date(), settings, session = null } = {}) => {
  const resolvedSettings = settings || await getSettings(session);
  const inputs = await collectReorderInputs(item, { now, settings: resolvedSettings, session });
  const safetyStock = Number(item.safetyStock || resolvedSettings.purchasingAutomation?.defaultSafetyStock || 0);
  const recommendation = calculateReorderRecommendation({ ...inputs, reorderPoint: item.reorderLevel, targetStock: item.targetStock, safetyStock, minimumOrderQuantity: item.minimumOrderQuantity, orderMultiple: item.orderMultiple });
  const supplierId = item.supplier?._id || item.supplier || null;
  const price = await resolveSuggestionPrice(item._id, supplierId, session);
  const warnings = ["RESERVATIONS_NOT_TRACKED"];
  if (inputs.legacyStockFallback) warnings.push("LEGACY_STOCK_FALLBACK");
  if (!supplierId) warnings.push("MISSING_PREFERRED_SUPPLIER");
  if (!inputs.leadTimeDays) warnings.push("MISSING_LEAD_TIME");
  if (!price.unitPrice) warnings.push("MISSING_PURCHASE_PRICE");
  if (!inputs.reliableUsage) warnings.push("INSUFFICIENT_USAGE_HISTORY");
  const reasonCodes = [];
  if (recommendation.projectedAvailable <= 0) reasonCodes.push("OUT_OF_STOCK");
  if (recommendation.projectedAvailable <= recommendation.effectiveReorderPoint) reasonCodes.push("BELOW_REORDER_POINT");
  reasonCodes.push(recommendation.demandAware ? "LEAD_TIME_DEMAND" : "STATIC_POLICY_FALLBACK");
  const breakdown = { ...inputs, reorderPoint: Number(item.reorderLevel || 0), targetStock: Number(item.targetStock || 0), safetyStock, minimumOrderQuantity: Number(item.minimumOrderQuantity || 1), orderMultiple: Number(item.orderMultiple || 1), ...recommendation, calculationVersion: resolvedSettings.purchasingAutomation?.calculationVersion || "reorder-v1" };
  const sourceSignature = signature({ stockVersion: item.stockVersion, ...breakdown, supplier: supplierId, price: price.unitPrice, priceRef: price.reference });
  return { supplierId, price, warnings, reasonCodes, breakdown, sourceSignature, shouldReorder: recommendation.finalPurchaseQuantity > 0, severity: recommendation.projectedAvailable <= 0 ? "critical" : recommendation.projectedAvailable <= safetyStock ? "high" : "medium", estimatedTotal: price.unitPrice ? money(price.unitPrice * recommendation.finalPurchaseQuantity) : null };
};

export const recalculateItemSuggestion = async (itemId, { now = new Date(), session = null } = {}) => {
  const [settings, item] = await Promise.all([getSettings(session), InventoryItem.findById(itemId).populate("supplier", "name isActive leadTimeDays").session(session || null)]);
  if (!item || !item.isActive || !item.reorderEnabled) {
    await ReorderSuggestion.updateOne({ item: itemId, status: { $ne: "resolved" } }, { $set: { status: "resolved", resolvedAt: now } }, session ? { session } : {});
    return null;
  }
  const result = await calculateItemReorder(item, { now, settings, session });
  const existing = await ReorderSuggestion.findOne({ item: item._id }).session(session || null);
  if (!result.shouldReorder) {
    if (existing && existing.status !== "resolved") { existing.status = "resolved"; existing.resolvedAt = now; await existing.save(session ? { session } : {}); }
    return existing;
  }
  const staleAt = new Date(now.getTime() + Number(settings.purchasingAutomation?.staleAfterHours || 24) * 3600000);
  let status = existing?.status || "open";
  if (status === "dismissed" && existing.snoozedUntil > now) status = "dismissed";
  else if (status === "converted" && existing.sourceSignature === result.sourceSignature) status = "converted";
  else if (existing && existing.sourceSignature !== result.sourceSignature) status = "open";
  else if (["converted", "resolved", "stale", "dismissed"].includes(status)) status = "open";
  const values = { item: item._id, category: item.category, supplier: result.supplierId, status, severity: result.severity, breakdown: result.breakdown, suggestedQuantity: result.breakdown.finalPurchaseQuantity, suggestedUnitPrice: result.price.unitPrice, priceSource: result.price.source, priceSourceReference: result.price.reference, estimatedTotal: result.estimatedTotal, warnings: result.warnings, reasonCodes: result.reasonCodes, sourceSignature: result.sourceSignature, calculatedAt: now, staleAt, ...(status === "open" ? { reviewedQuantity: null, reviewedUnitPrice: null, reviewedSupplier: null, reviewedBy: null, reviewedAt: null, overrideReason: "", convertedPurchaseOrder: null, convertedAt: null, resolvedAt: null } : {}) };
  return ReorderSuggestion.findOneAndUpdate({ item: item._id }, { $set: values, $setOnInsert: { fingerprint: `reorder:${item._id}` } }, { upsert: true, new: true, runValidators: true, session: session || undefined });
};

export const recalculateAllSuggestions = async ({ actor, now = new Date() }) => {
  const items = await InventoryItem.find({ isActive: true, reorderEnabled: true }).select("_id").lean();
  const rows = [];
  for (const item of items) rows.push(await recalculateItemSuggestion(item._id, { now }));
  await recordAuditLog({ actor, action: "REORDER_SUGGESTIONS_RECALCULATED", entityType: "ReorderSuggestion", reason: "Manual secured full recalculation", after: { scanned: items.length, active: rows.filter(Boolean).length } });
  return { scanned: items.length, active: rows.filter(Boolean).length };
};

export const refreshAffectedSuggestions = async (itemIds = []) => {
  const unique = [...new Set(itemIds.filter(Boolean).map(String))];
  for (const itemId of unique) {
    try { await recalculateItemSuggestion(itemId); }
    catch (error) { console.error("Reorder focused recalculation failed", { itemId, code: error.code || error.name, message: error.message }); }
  }
};

export const generateDraftPurchaseOrders = async ({ suggestionIds, overrides = [], idempotencyKey, actor, purchaseSettings = {} }) => {
  if (!idempotencyKey?.trim()) throw new ValidationError("An idempotency key is required");
  if (!Array.isArray(suggestionIds) || !suggestionIds.length) throw new ValidationError("Select at least one suggestion");
  const prior = await PurchaseAutomationRun.findOne({ idempotencyKey }).populate("purchaseOrders");
  if (prior?.status === "completed") return { run: prior, purchaseOrders: prior.purchaseOrders, duplicate: true };
  const overrideMap = new Map(overrides.map((entry) => [String(entry.suggestion), entry]));
  try {
    return await runInventoryTransaction(async (session) => {
      const [run] = await PurchaseAutomationRun.create([{ idempotencyKey, suggestionIds, createdBy: actor._id, status: "processing" }], { session });
      const suggestions = await ReorderSuggestion.find({ _id: { $in: suggestionIds } }).populate({ path: "item", populate: { path: "supplier", select: "name isActive leadTimeDays" } }).session(session);
      if (suggestions.length !== suggestionIds.length) throw new ValidationError("One or more reorder suggestions were not found");
      const settings = await getSettings(session); const groups = new Map();
      for (const suggestion of suggestions) {
        if (!["open", "reviewed"].includes(suggestion.status)) throw new ValidationError("Only open or reviewed suggestions can be converted");
        const current = await calculateItemReorder(suggestion.item, { settings, session });
        if (!current.shouldReorder || current.sourceSignature !== suggestion.sourceSignature || suggestion.staleAt <= new Date()) throw new ValidationError(`Suggestion for ${suggestion.item.name} is stale. Recalculate before generating a PO`);
        const override = overrideMap.get(String(suggestion._id)) || {};
        const supplierId = override.supplier || suggestion.reviewedSupplier || suggestion.supplier;
        const supplier = supplierId ? await Supplier.findOne({ _id: supplierId, isActive: true }).session(session) : null;
        if (!supplier) throw new ValidationError(`An active supplier is required for ${suggestion.item.name}`);
        const finalQuantity = Number(override.quantity ?? suggestion.reviewedQuantity ?? suggestion.suggestedQuantity);
        const minimum = Number(suggestion.item.minimumOrderQuantity || 1); const multiple = Number(suggestion.item.orderMultiple || 1);
        if (!(finalQuantity > 0) || finalQuantity < minimum || Math.abs(finalQuantity / multiple - Math.round(finalQuantity / multiple)) > 1e-6) throw new ValidationError(`${suggestion.item.name} quantity must respect MOQ ${minimum} and order multiple ${multiple}`);
        const changed = finalQuantity !== Number(suggestion.suggestedQuantity) || String(supplierId) !== String(suggestion.supplier) || override.unitPrice != null || suggestion.reviewedUnitPrice != null;
        if (changed && !String(override.reason || suggestion.overrideReason || "").trim()) throw new ValidationError(`Override reason is required for ${suggestion.item.name}`);
        const manualUnitPrice = override.unitPrice ?? suggestion.reviewedUnitPrice;
        const price = manualUnitPrice != null ? { unitPrice: Number(manualUnitPrice), source: "manual", reference: null } : await resolveSuggestionPrice(suggestion.item._id, supplier._id, session);
        if (!(price.unitPrice > 0)) throw new ValidationError(`A reviewed purchase price is required for ${suggestion.item.name}`);
        const key = String(supplier._id); if (!groups.has(key)) groups.set(key, { supplier, lines: [], suggestions: [] });
        groups.get(key).lines.push({ item: suggestion.item._id, quantity: finalQuantity, unitCost: price.unitPrice, reorderSuggestion: suggestion._id, priceSource: price.source, priceSourceReference: price.reference });
        groups.get(key).suggestions.push(suggestion);
      }
      const purchaseOrders = [];
      for (const group of groups.values()) {
        const po = await createPurchaseOrderInSession({ supplier: group.supplier._id, items: group.lines, automationRun: run._id, sourceSuggestions: group.suggestions.map((row) => row._id), notes: "Draft generated from reviewed reorder suggestions." }, actor, purchaseSettings, session);
        purchaseOrders.push(po);
        for (const suggestion of group.suggestions) { suggestion.status = "converted"; suggestion.convertedPurchaseOrder = po._id; suggestion.convertedAt = new Date(); await suggestion.save({ session }); }
      }
      run.status = "completed"; run.purchaseOrders = purchaseOrders.map((po) => po._id); await run.save({ session });
      await recordAuditLog({ actor, action: "REORDER_DRAFT_POS_GENERATED", entityType: "PurchaseAutomationRun", entityId: run._id, entityLabel: idempotencyKey, after: { purchaseOrders: purchaseOrders.map((po) => ({ id: po._id, orderNumber: po.orderNumber, status: po.status })), suggestions: suggestionIds }, metadata: { groupedSuppliers: groups.size, overrides: overrides.map((row) => ({ suggestion: row.suggestion, quantity: row.quantity, supplier: row.supplier, unitPrice: row.unitPrice, reason: String(row.reason || "").trim() })) } }, { session });
      return { run, purchaseOrders, duplicate: false };
    });
  } catch (error) {
    if (error?.code === 11000) {
      const completed = await PurchaseAutomationRun.findOne({ idempotencyKey }).populate("purchaseOrders");
      if (completed?.status === "completed") return { run: completed, purchaseOrders: completed.purchaseOrders, duplicate: true };
      throw new ValidationError("This draft generation request is already processing");
    }
    throw error;
  }
};
