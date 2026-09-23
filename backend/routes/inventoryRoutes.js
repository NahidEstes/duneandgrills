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

const router = express.Router();

router.use(protect, requireCapability(CAPABILITIES.INVENTORY_READ));
const write = requireCapability(CAPABILITIES.INVENTORY_WRITE);
const approveCount = requireCapability(CAPABILITIES.INVENTORY_COUNT_APPROVE);

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
router.route("/waste").get(listWasteRecords).post(write, createWasteRecord);
router.route("/counts").get(listCounts).post(write, createCount);
router.post("/counts/:id/submit", write, submitCount);
router.post("/counts/:id/complete", approveCount, completeCount);
router.post("/counts/:id/review", approveCount, reviewCount);
router.post("/counts/:id/cancel", approveCount, cancelCount);

router.route("/purchase-orders").get(listPurchaseOrders).post(write, createPurchaseOrderController);
router.patch("/purchase-orders/:id/status", write, changePurchaseOrderStatus);
router.post("/purchase-orders/:id/receive", write, receivePurchaseOrderController);
router.route("/purchase-orders/:id").get(getPurchaseOrder).patch(write, updatePurchaseOrderController);

export default router;
