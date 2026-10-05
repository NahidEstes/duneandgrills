import mongoose from "mongoose";
import Order from "../models/Order.js";
import InventoryItem from "../models/InventoryItem.js";
import Expense from "../models/Expense.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import InventoryCount from "../models/InventoryCount.js";
import InventoryBatch from "../models/InventoryBatch.js";
import Supplier from "../models/Supplier.js";
import User from "../models/User.js";
import PosTerminal from "../models/PosTerminal.js";
import Refund from "../models/Refund.js";
import SupplierPayment from "../models/SupplierPayment.js";
import PosShift from "../models/PosShift.js";
import CashMovement from "../models/CashMovement.js";
import StockTransaction from "../models/StockTransaction.js";
import PosHeldSale from "../models/PosHeldSale.js";
import { CAPABILITIES as C, hasCapability } from "../config/permissions.js";
import { escapeRegex, ValidationError } from "../utils/inventoryValidation.js";

const descriptor = (model, fields, capability, select, extra = {}) => ({ model, fields, capability, select: `${fields.join(" ")} createdAt ${select}`, ...extra });
export const RECORD_SEARCH_TYPES = {
  order: descriptor(Order, ["orderNumber", "externalOrderId"], C.ORDERS_READ_ALL, "status source orderType terminal", { title: row => `${row.source || "Website"} order`, date: "createdAt" }),
  inventory: descriptor(InventoryItem, ["sku"], C.INVENTORY_READ, "name isActive", { title: row => row.name }),
  expense: descriptor(Expense, ["expenseNumber"], C.FINANCE_READ, "title paymentStatus expenseDate vendor", { title: row => row.title, date: "expenseDate", context: row => row.vendor }),
  purchase: descriptor(PurchaseOrder, ["orderNumber"], C.INVENTORY_READ, "status supplier", { populate: { path: "supplier", select: "name code" }, context: row => `${row.supplier?.name || ""} ${row.supplier?.code || ""}` }),
  invoice: descriptor(SupplierInvoice, ["internalReference", "supplierInvoiceNumber"], C.PAYABLES_READ, "status paymentStatus supplier invoiceDate", { populate: { path: "supplier", select: "name code" }, date: "invoiceDate", context: row => `${row.supplier?.name || ""} ${row.supplier?.code || ""}` }),
  count: descriptor(InventoryCount, ["countNumber"], C.INVENTORY_READ, "status"),
  batch: descriptor(InventoryBatch, ["lotNumber"], C.INVENTORY_READ, "item supplier qualityStatus receivedAt brand", { populate: [{ path: "item", select: "name sku" }, { path: "supplier", select: "name code" }], date: "receivedAt", context: row => `${row.item?.name || ""} ${row.item?.sku || ""} · ${row.supplier?.name || ""} · ${row.brand || ""}` }),
  supplier: descriptor(Supplier, ["code"], C.INVENTORY_READ, "name isActive", { title: row => row.name }),
  customer: descriptor(User, ["customerNumber"], C.ADMIN_DASHBOARD, "name isActive", { filter: { role: "customer" }, title: row => row.name }),
  staff: descriptor(User, ["employeeId"], C.STAFF_READ, "name role isActive", { filter: { role: { $ne: "customer" } }, title: row => row.name, context: row => row.role }),
  terminal: descriptor(PosTerminal, ["code"], C.POS_OPERATE, "name isActive locationLabel", { title: row => row.name, context: row => row.locationLabel }),
  refund: descriptor(Refund, ["refundNumber"], C.REFUNDS_READ, "status order requestedBy originalCashier", { populate: { path: "order", select: "orderNumber" }, context: row => row.order?.orderNumber, scope: actor => actor.role === "cashier" ? { $or: [{ requestedBy: actor._id }, { originalCashier: actor._id }] } : {} }),
  payment: descriptor(SupplierPayment, ["paymentNumber"], C.PAYABLES_READ, "status supplier invoice paymentDate", { populate: [{ path: "supplier", select: "name code" }, { path: "invoice", select: "internalReference supplierInvoiceNumber" }], date: "paymentDate", context: row => `${row.supplier?.name || ""} · ${row.invoice?.internalReference || ""} · ${row.invoice?.supplierInvoiceNumber || ""}` }),
  shift: descriptor(PosShift, ["shiftNumber"], C.POS_OPERATE, "status cashier terminal openedAt", { populate: { path: "cashier", select: "name" }, date: "openedAt", context: row => `${row.cashier?.name || ""} · ${row.terminal || ""}`, scope: actor => hasCapability(actor.role, C.POS_SHIFT_MANAGE) ? {} : { cashier: actor._id } }),
  cash: descriptor(CashMovement, ["movementNumber"], C.POS_OPERATE, "type direction shift createdBy terminalSnapshot.code", { context: row => `${row.type} · ${row.terminalSnapshot?.code || ""}`, scope: actor => hasCapability(actor.role, C.POS_SHIFT_MANAGE) ? {} : { createdBy: actor._id } }),
  stock: descriptor(StockTransaction, ["transactionNumber", "reference"], C.INVENTORY_READ, "movementType status item occurredAt", { populate: { path: "item", select: "name sku" }, date: "occurredAt", title: row => row.movementType, context: row => `${row.item?.name || ""} · ${row.item?.sku || ""}` }),
  held: descriptor(PosHeldSale, ["heldSaleNumber"], C.POS_OPERATE, "label status cashier terminal", { title: row => row.label || "Held sale", context: row => row.terminal, scope: actor => hasCapability(actor.role, C.POS_HISTORY_VIEW_ALL) ? {} : { cashier: actor._id } }),
};

const permitted = (type, actor) => Boolean(RECORD_SEARCH_TYPES[type] && hasCapability(actor.role, RECORD_SEARCH_TYPES[type].capability));
const scope = (spec, actor) => ({ $and: [spec.filter || {}, spec.scope?.(actor) || {}] });
const serialize = (type, spec, row, matchedField = spec.fields[0]) => ({
  type, id: String(row._id), readableId: row[matchedField] || row[spec.fields[0]] || "Not yet assigned",
  identifiers: Object.fromEntries(spec.fields.filter(field => row[field]).map(field => [field, row[field]])),
  title: spec.title?.(row) || type, status: row.status || row.paymentStatus || row.qualityStatus || (row.isActive === false ? "inactive" : "active"),
  date: row[spec.date || "createdAt"] || row.createdAt, context: spec.context?.(row) || "",
  href: `/admin/record-search?type=${type}&id=${row._id}`,
});
const read = (spec, filter, limit, exact = false) => {
  let query = spec.model.find(filter).select(spec.select).sort({ createdAt: -1, _id: -1 }).limit(limit).maxTimeMS(2000);
  if (exact) query = query.collation({ locale: "en", strength: 2 });
  if (spec.populate) query = query.populate(spec.populate);
  return query.lean();
};

export async function searchRecords(actor, { q, page = 1, limit = 15 } = {}) {
  const term = String(q || "").trim();
  if (term.length < 2 || term.length > 120) throw new ValidationError("Enter an ID between 2 and 120 characters");
  page = Math.min(20, Math.max(1, Number.parseInt(page, 10) || 1));
  limit = Math.min(25, Math.max(1, Number.parseInt(limit, 10) || 15));
  const window = page * limit + 1;
  const exact = new RegExp(`^${escapeRegex(term)}$`, "i");
  const partial = new RegExp(escapeRegex(term), "i");
  const prefixTypes = { RFN: "refund", PAY: "payment", PSH: "shift", CSH: "cash", STX: "stock", HLD: "held", CUS: "customer", EMP: "staff", EXP: "expense", INV: "inventory" };
  const likely = prefixTypes[term.toUpperCase().split("-")[0]];
  const types = Object.keys(RECORD_SEARCH_TYPES).filter(type => permitted(type, actor)).sort((a, b) => Number(b === likely) - Number(a === likely));
  if (!types.length) throw Object.assign(new Error("Record search is not available for this account"), { status: 403 });
  // Search all permitted types even for known prefixes: legacy and vendor IDs can look like any prefix.
  const matches = (expression, exactMatch = false) => Promise.all(types.map(async type => {
    const spec = RECORD_SEARCH_TYPES[type];
    const rows = await read(spec, { $and: [scope(spec, actor), { $or: spec.fields.map(field => ({ [field]: exactMatch ? term : expression })) }] }, window, exactMatch);
    return rows.map(row => serialize(type, spec, row, spec.fields.find(field => expression.test(String(row[field] || "")))));
  }));
  const exactRows = (await matches(exact, true)).flat();
  const seen = new Set(exactRows.map(row => `${row.type}:${row.id}`));
  const partialRows = exactRows.length >= window ? [] : (await matches(partial)).flat().filter(row => !seen.has(`${row.type}:${row.id}`));
  const all = [...exactRows, ...partialRows];
  return { data: all.slice((page - 1) * limit, page * limit), pagination: { page, limit, hasMore: page < 20 && all.length > page * limit } };
}

export async function getRecordDetails(actor, type, id) {
  if (!permitted(type, actor)) throw Object.assign(new Error("Record not found"), { status: 404 });
  if (!mongoose.isValidObjectId(id)) throw new ValidationError("Invalid record identity");
  const spec = RECORD_SEARCH_TYPES[type];
  const [row] = await read(spec, { $and: [scope(spec, actor), { _id: id }] }, 1);
  if (!row) throw Object.assign(new Error("Record not found"), { status: 404 });
  return serialize(type, spec, row);
}
