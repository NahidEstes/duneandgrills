import express from "express";
import {
  archiveItem,
  createItem,
  getItem,
  itemHistory,
  listItems,
  updateItem,
  suggestItemSku,
} from "../controllers/inventory/itemController.js";
import {
  archiveCategory,
  archiveSupplier,
  createCategory,
  createSupplier,
  listCategories,
  listSuppliers,
  supplierPurchases,
  updateCategory,
  updateSupplier,
} from "../controllers/inventory/masterDataController.js";
import {
  cancelCount,
  completeCount,
  reviewCount,
  submitCount,
  createCount,
  createMovement,
  listCounts,
  listMovements,
} from "../controllers/inventory/stockController.js";
import {
  changePurchaseOrderStatus,
  createPurchaseOrderController,
  getPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrderController,
  updatePurchaseOrderController,
} from "../controllers/inventory/purchaseOrderController.js";
import {
  getAlerts,
  getDashboard,
  getReport,
  getSettings,
  updateSettings,
} from "../controllers/inventory/dashboardController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";
import { getRecipe, listRecipes, updateRecipe } from "../controllers/inventory/recipeController.js";
import { createWasteRecord, listWasteRecords } from "../controllers/inventory/wasteController.js";
import { listBatches } from "../controllers/inventory/batchController.js";
import { getAddOnRecipe, listAddOnRecipes, updateAddOnRecipe } from "../controllers/inventory/addOnRecipeController.js";
import { createSupplierInvoiceController, getSupplierInvoice, listSupplierInvoices, recordSupplierPaymentController, reverseSupplierPaymentController, transitionSupplierInvoiceController, updateSupplierInvoiceController } from "../controllers/inventory/supplierInvoiceController.js";
import { listPurchasePriceHistory } from "../controllers/inventory/purchasePriceController.js";
import { dismissSuggestion, generateDrafts, listReorderSuggestions, recalculateSuggestions, reviewSuggestion } from "../controllers/inventory/reorderController.js";
import { listPurchasingActions, refreshActions, updateActionState } from "../controllers/inventory/purchasingActionController.js";

const router = express.Router();

router.use(protect, requireCapability(CAPABILITIES.INVENTORY_READ));
const write = requireCapability(CAPABILITIES.INVENTORY_WRITE);
const approveCount = requireCapability(CAPABILITIES.INVENTORY_COUNT_APPROVE);
const approvePurchase = requireCapability(CAPABILITIES.PURCHASE_APPROVE);
const payablesRead = requireCapability(CAPABILITIES.PAYABLES_READ);
const payablesWrite = requireCapability(CAPABILITIES.PAYABLES_WRITE);
const payablesApprove = requireCapability(CAPABILITIES.PAYABLES_APPROVE);
const recordPayment = requireCapability(CAPABILITIES.SUPPLIER_PAYMENT_RECORD);
const reorderRead = requireCapability(CAPABILITIES.REORDER_READ);
const reorderManage = requireCapability(CAPABILITIES.REORDER_MANAGE);
const automatePurchases = requireCapability(CAPABILITIES.PURCHASE_AUTOMATE);
const actionRead = requireCapability(CAPABILITIES.PURCHASING_ACTION_READ);
const actionManage = requireCapability(CAPABILITIES.PURCHASING_ACTION_MANAGE);

router.get("/dashboard", getDashboard);
router.get("/alerts", getAlerts);
router.get("/reports", getReport);
router.route("/settings").get(getSettings).patch(approveCount, updateSettings);

router.route("/items").get(listItems).post(write, createItem);
router.get("/categories/:categoryId/sku-suggestion", suggestItemSku);
router.get("/batches", listBatches);
router.get("/items/:id/history", itemHistory);
router.route("/items/:id").get(getItem).patch(write, updateItem).delete(write, archiveItem);

router.route("/categories").get(listCategories).post(write, createCategory);
router.route("/categories/:id").patch(write, updateCategory).delete(write, archiveCategory);

router.route("/suppliers").get(listSuppliers).post(write, createSupplier);
router.get("/suppliers/:id/purchases", supplierPurchases);
router.route("/suppliers/:id").patch(write, updateSupplier).delete(write, archiveSupplier);

router.route("/movements").get(listMovements).post(write, createMovement);
router.get("/recipes", listRecipes);
router.route("/recipes/:menuItemId").get(getRecipe).put(write, updateRecipe);
router.get("/add-on-recipes", listAddOnRecipes);
router.route("/add-on-recipes/:addOnId").get(getAddOnRecipe).put(write, updateAddOnRecipe);
router.route("/waste").get(listWasteRecords).post(write, createWasteRecord);
router.route("/counts").get(listCounts).post(write, createCount);
router.post("/counts/:id/submit", write, submitCount);
router.post("/counts/:id/complete", approveCount, completeCount);
router.post("/counts/:id/review", approveCount, reviewCount);
router.post("/counts/:id/cancel", approveCount, cancelCount);

router.route("/purchase-orders").get(listPurchaseOrders).post(write, createPurchaseOrderController);
router.patch("/purchase-orders/:id/status", (req, res, next) => ["approved", "rejected"].includes(req.body.status) ? approvePurchase(req, res, next) : write(req, res, next), changePurchaseOrderStatus);
router.post("/purchase-orders/:id/receive", write, receivePurchaseOrderController);
router.route("/purchase-orders/:id").get(getPurchaseOrder).patch(write, updatePurchaseOrderController);
router.get("/purchase-price-history", listPurchasePriceHistory);

router.get("/reorder-suggestions", reorderRead, listReorderSuggestions);
router.post("/reorder-suggestions/recalculate", reorderManage, recalculateSuggestions);
router.patch("/reorder-suggestions/:id/review", reorderManage, reviewSuggestion);
router.patch("/reorder-suggestions/:id/dismiss", reorderManage, dismissSuggestion);
router.post("/reorder-suggestions/generate-drafts", automatePurchases, generateDrafts);

router.get("/purchasing-actions", actionRead, listPurchasingActions);
router.post("/purchasing-actions/refresh", actionManage, refreshActions);
router.patch("/purchasing-actions/:id/state", actionManage, updateActionState);

router.route("/supplier-invoices").get(payablesRead, listSupplierInvoices).post(payablesWrite, createSupplierInvoiceController);
router.route("/supplier-invoices/:id").get(payablesRead, getSupplierInvoice).patch(payablesWrite, updateSupplierInvoiceController);
router.patch("/supplier-invoices/:id/status", (req, res, next) => ["approved", "posted", "voided", "disputed"].includes(req.body.status) ? payablesApprove(req, res, next) : payablesWrite(req, res, next), transitionSupplierInvoiceController);
router.post("/supplier-invoices/:id/payments", recordPayment, recordSupplierPaymentController);
router.post("/supplier-payments/:paymentId/reverse", payablesApprove, reverseSupplierPaymentController);

export default router;
