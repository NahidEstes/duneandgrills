import PurchasePriceHistory from "../models/PurchasePriceHistory.js";
import { toBaseUnitCost } from "./inventoryUnitService.js";

export const recordPurchasePrices = async ({ purchaseOrder, type, actorId, session = null, receipts = [], invoice = null }) => {
  const receiptByLine = new Map(receipts.map((row) => [String(row.lineId), row]));
  const invoiceByLine = new Map((invoice?.items || []).map((row) => [String(row.purchaseOrderLine), row]));
  const operations = purchaseOrder.items.map((line) => {
    const receipt = receiptByLine.get(String(line._id));
    const invoiceLine = invoiceByLine.get(String(line._id));
    if (type === "invoiced" && !invoiceLine) return null;
    const unitPrice = Number(invoiceLine?.unitPrice ?? receipt?.unitPrice ?? line.unitCost);
    const lifecycleKey = [type, purchaseOrder._id, line._id, receipt?.transaction?._id || invoice?._id || purchaseOrder.revision].join(":");
    return { updateOne: { filter: { lifecycleKey }, update: { $setOnInsert: { item: line.item, sku: line.sku, supplier: purchaseOrder.supplier, quantity: Number(invoiceLine?.quantity ?? receipt?.quantity ?? line.quantity), unit: line.purchaseUnit || line.baseUnit, conversionFactor: Number(line.conversionFactor || 1), unitPrice, baseUnitPrice: toBaseUnitCost(unitPrice, Number(line.conversionFactor || 1)), priceType: type, purchaseOrder: purchaseOrder._id, receipt: receipt?.transaction?._id || null, invoice: invoice?._id || null, effectiveAt: invoice?.invoiceDate || receipt?.receivedAt || new Date(), actor: actorId || null, lifecycleKey, warning: Number(line.conversionFactor || 0) > 0 ? "" : "Missing unit conversion" } }, upsert: true } };
  }).filter(Boolean);
  if (operations.length) await PurchasePriceHistory.bulkWrite(operations, session ? { session } : {});
};

export const getPriceHistoryReport = async ({ item, supplier, from, to, limit = 200 }) => {
  const filter = {};
  if (item) filter.item = item;
  if (supplier) filter.supplier = supplier;
  if (from || to) filter.effectiveAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(`${to}T23:59:59.999Z`) } : {}) };
  const rows = await PurchasePriceHistory.find(filter).populate("item", "name sku unit").populate("supplier", "name code").sort({ effectiveAt: -1 }).limit(Math.min(500, Number(limit) || 200)).lean();
  const byItem = new Map();
  for (const row of rows) { const key = String(row.item?._id || row.item); if (!byItem.has(key)) byItem.set(key, []); byItem.get(key).push(row); }
  const summaries = [...byItem.entries()].map(([itemId, allValues]) => {
    const actual = allValues.filter((row) => row.priceType === "invoiced");
    const fallback = allValues.filter((row) => ["received", "approved"].includes(row.priceType));
    const values = actual.length ? actual : fallback;
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => new Date(b.effectiveAt) - new Date(a.effectiveAt));
    const latestBySupplier = [...new Map(sorted.map((row) => [String(row.supplier?._id || row.supplier), row])).values()];
    const latest = sorted[0]; const previous = sorted[1]; const change = previous ? latest.baseUnitPrice - previous.baseUnitPrice : null;
    return { itemId, item: latest.item, source: actual.length ? "posted_invoice_actual" : "received_or_approved_fallback", lastPrice: latest.baseUnitPrice, previousPrice: previous?.baseUnitPrice ?? null, change, changePercent: previous?.baseUnitPrice > 0 ? Number(((change / previous.baseUnitPrice) * 100).toFixed(2)) : null, averagePrice: Number((sorted.reduce((sum, row) => sum + row.baseUnitPrice, 0) / sorted.length).toFixed(4)), lowestSupplierPrice: Math.min(...latestBySupplier.map((row) => row.baseUnitPrice)), highestSupplierPrice: Math.max(...latestBySupplier.map((row) => row.baseUnitPrice)), suppliers: latestBySupplier };
  }).filter(Boolean);
  return { rows, summaries };
};
