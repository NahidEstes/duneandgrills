// Business records are read-only here. No business service or mutation is called.
import mongoose from "mongoose";
import InventoryItem from "../models/InventoryItem.js";
import Supplier from "../models/Supplier.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import User from "../models/User.js";
import { PlannerError, assertPlannerObject } from "./plannerRules.js";

const sources = {
  inventory: { model: InventoryItem, fields: ["name", "sku"] },
  supplier: { model: Supplier, fields: ["name", "code"] },
  invoice: { model: SupplierInvoice, fields: ["internalReference", "supplierInvoiceNumber"] },
  purchase: { model: PurchaseOrder, fields: ["orderNumber"] },
  staff: { model: User, fields: ["name", "employeeId"], filter: { role: { $ne: "customer" } } },
};
const labelOf = (row, source) => source.fields.map(field => row[field]).filter(Boolean).join(" · ") || "Record";
const validId = id => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
export const searchPlannerReferences = async (type, search = "") => {
  const source = sources[type];
  if (!Object.hasOwn(sources, type)) throw new PlannerError("Invalid reference type");
  if (typeof search !== "string" || search.length > 100) throw new PlannerError("Search must contain at most 100 characters");
  const pattern = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const rows = await source.model.find({ ...source.filter, $or: source.fields.map(field => ({ [field]: pattern })) }).select(source.fields.join(" ")).sort({ _id: -1 }).limit(30).lean();
  return rows.map(row => ({ type, id: String(row._id), label: labelOf(row, source) }));
};
export const resolvePlannerReference = async (value, current = null) => {
  if (value === null || value === undefined) return null;
  assertPlannerObject(value);
  if (!Object.hasOwn(sources, value.type) || !validId(value.id) || Object.keys(value).some(key => !["type", "id"].includes(key))) throw new PlannerError("Choose a valid linked record");
  const source = sources[value.type];
  const row = await source.model.findOne({ _id: value.id, ...source.filter }).select(source.fields.join(" ")).lean();
  if (!row) {
    if (current?.type === value.type && String(current.id) === value.id) return { type: current.type, id: current.id, label: current.label };
    throw new PlannerError("Linked record no longer exists. Clear or change the reference", 404);
  }
  return { type: value.type, id: row._id, label: labelOf(row, source) };
};
export const resolvePlannerResponsible = async (id, current = null) => {
  if (!id) return null;
  const record = await resolvePlannerReference({ type: "staff", id }, current?.id ? { type: "staff", id: current.id, label: current.name } : null);
  return { id: record.id, name: record.label };
};
export const plannerReferenceAvailability = async value => {
  if (!value?.id || !Object.hasOwn(sources, value.type)) return null;
  const source = sources[value.type];
  const available = Boolean(await source.model.exists({ _id: new mongoose.Types.ObjectId(String(value.id)), ...source.filter }));
  return { ...value, available, href: available ? `/admin/record-search?type=${value.type}&id=${value.id}` : null };
};
