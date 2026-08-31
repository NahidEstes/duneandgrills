import express from "express";
import {
  archiveItem,
  createItem,
  getItem,
  itemHistory,
  listItems,
  updateItem,
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
import { authorize, protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect, authorize("admin", "manager"));

router.get("/dashboard", getDashboard);
router.get("/alerts", getAlerts);
router.get("/reports", getReport);
router.route("/settings").get(getSettings).patch(updateSettings);

router.route("/items").get(listItems).post(createItem);
router.get("/items/:id/history", itemHistory);
router.route("/items/:id").get(getItem).patch(updateItem).delete(archiveItem);

router.route("/categories").get(listCategories).post(createCategory);
router.route("/categories/:id").patch(updateCategory).delete(archiveCategory);

router.route("/suppliers").get(listSuppliers).post(createSupplier);
router.get("/suppliers/:id/purchases", supplierPurchases);
router.route("/suppliers/:id").patch(updateSupplier).delete(archiveSupplier);

router.route("/movements").get(listMovements).post(createMovement);
router.route("/counts").get(listCounts).post(createCount);
router.post("/counts/:id/complete", completeCount);
router.post("/counts/:id/cancel", cancelCount);

router.route("/purchase-orders").get(listPurchaseOrders).post(createPurchaseOrderController);
router.patch("/purchase-orders/:id/status", changePurchaseOrderStatus);
router.post("/purchase-orders/:id/receive", receivePurchaseOrderController);
router.route("/purchase-orders/:id").get(getPurchaseOrder).patch(updatePurchaseOrderController);

export default router;
