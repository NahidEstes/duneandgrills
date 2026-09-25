import SupplierInvoice from "../../models/SupplierInvoice.js";
import SupplierPayment from "../../models/SupplierPayment.js";
import { parsePagination } from "../../utils/inventoryValidation.js";
import { getEffectiveRestaurantSettings } from "../../services/restaurantSettingsService.js";
import { createSupplierInvoice, decorateInvoice, getPayablesAging, recordSupplierPayment, reverseSupplierPayment, transitionSupplierInvoice, updateSupplierInvoice } from "../../services/supplierInvoiceService.js";
import { refreshAffectedSuggestions } from "../../services/reorderService.js";

const populate = [
  { path: "supplier", select: "name code paymentTerms" },
  { path: "purchaseOrders", select: "orderNumber status total receivedAt" },
  { path: "items.item", select: "name sku unit" },
  { path: "createdBy approvedBy postedBy", select: "name role" },
];

export const listSupplierInvoices = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 20); const filter = {};
    if (req.query.supplier) filter.supplier = req.query.supplier; if (req.query.status) filter.status = req.query.status;
    if (req.query.paymentStatus) filter.paymentStatus = String(req.query.paymentStatus).trim().toLowerCase().replaceAll(" ", "_");
    if (req.query.overdue === "true") filter.dueDate = { $lt: new Date() }, filter.paymentStatus = { $ne: "paid" }, filter.status = "posted";
    if (req.query.from || req.query.to) filter.invoiceDate = { ...(req.query.from ? { $gte: new Date(req.query.from) } : {}), ...(req.query.to ? { $lte: new Date(`${req.query.to}T23:59:59.999Z`) } : {}) };
    const [rows, total, aging] = await Promise.all([SupplierInvoice.find(filter).populate(populate).sort({ invoiceDate: -1, createdAt: -1 }).skip(skip).limit(limit).lean(), SupplierInvoice.countDocuments(filter), getPayablesAging()]);
    res.json({ success: true, data: rows.map((row) => decorateInvoice(row)), aging, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

export const getSupplierInvoice = async (req, res, next) => {
  try { const row = await SupplierInvoice.findById(req.params.id).populate(populate).lean(); if (!row) return res.status(404).json({ success: false, message: "Supplier invoice not found" }); const payments = await SupplierPayment.find({ invoice: row._id }).populate("createdBy reversedBy", "name role").sort({ paymentDate: -1 }).lean(); res.json({ success: true, data: decorateInvoice(row), payments }); } catch (error) { next(error); }
};

const settings = async () => (await getEffectiveRestaurantSettings()).procurement;
export const createSupplierInvoiceController = async (req, res, next) => { try { const row = await createSupplierInvoice(req.body, req.user, await settings()); await row.populate(populate); res.status(201).json({ success: true, data: decorateInvoice(row.toObject()) }); } catch (error) { if (error?.code === 11000) return res.status(409).json({ success: false, message: "This supplier invoice number already exists for the supplier" }); next(error); } };
export const updateSupplierInvoiceController = async (req, res, next) => { try { const row = await updateSupplierInvoice(req.params.id, req.body, req.user, await settings()); await row.populate(populate); res.json({ success: true, data: decorateInvoice(row.toObject()) }); } catch (error) { if (error?.code === 11000) return res.status(409).json({ success: false, message: "This supplier invoice number already exists for the supplier" }); next(error); } };
export const transitionSupplierInvoiceController = async (req, res, next) => { try { const result = await transitionSupplierInvoice({ id: req.params.id, target: req.body.status, actor: req.user, settings: await settings(), reason: req.body.reason, idempotencyKey: req.body.idempotencyKey }); if (req.body.status === "posted") await refreshAffectedSuggestions(result.invoice.items.map((line) => line.item)); await result.invoice.populate(populate); res.json({ success: true, data: decorateInvoice(result.invoice.toObject()), duplicate: result.duplicate }); } catch (error) { next(error); } };
export const recordSupplierPaymentController = async (req, res, next) => { try { const result = await recordSupplierPayment({ invoiceId: req.params.id, payload: req.body, actor: req.user, settings: await settings() }); res.status(result.duplicate ? 200 : 201).json({ success: true, data: { payment: result.payment, invoice: decorateInvoice(result.invoice.toObject()) }, duplicate: result.duplicate }); } catch (error) { next(error); } };
export const reverseSupplierPaymentController = async (req, res, next) => { try { const result = await reverseSupplierPayment({ paymentId: req.params.paymentId, actor: req.user, reason: req.body.reason }); res.json({ success: true, data: { payment: result.payment, invoice: decorateInvoice(result.invoice.toObject()) } }); } catch (error) { next(error); } };
