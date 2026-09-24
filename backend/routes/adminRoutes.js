import express from "express";
import {
  getAdminUsers,
  getDashboard,
  searchAdmin,
} from "../controllers/adminController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";
import { createStaff, listStaff, resetStaffPassword, setStaffActive, updateStaff } from "../controllers/staffController.js";
import { getAdminAnalytics } from "../controllers/adminAnalyticsController.js";
import { listAuditLogs } from "../controllers/auditController.js";
import {
  getCustomer,
  getCustomerFavourites,
  getCustomerNotes,
  getCustomerOrders,
  getCustomerRewards,
  getCustomers,
  patchCustomerNote,
  postCustomerNote,
  removeCustomerNote,
} from "../controllers/customerCrmController.js";

const router = express.Router();

router.use(protect);
router.get("/staff", requireCapability(CAPABILITIES.STAFF_READ), listStaff);
router.post("/staff", requireCapability(CAPABILITIES.STAFF_MANAGE), createStaff);
router.patch("/staff/:id", requireCapability(CAPABILITIES.STAFF_MANAGE), updateStaff);
router.post("/staff/:id/active", requireCapability(CAPABILITIES.STAFF_MANAGE), setStaffActive);
router.post("/staff/:id/reset-password", requireCapability(CAPABILITIES.STAFF_MANAGE), resetStaffPassword);
router.use(requireCapability(CAPABILITIES.ADMIN_DASHBOARD));
router.get("/dashboard", getDashboard);
router.get("/analytics", getAdminAnalytics);
router.get("/audit-logs", requireCapability(CAPABILITIES.AUDIT_READ), listAuditLogs);
router.get("/users", getAdminUsers);
router.get("/customers", getCustomers);
router.get("/customers/:customerId", getCustomer);
router.get("/customers/:customerId/orders", getCustomerOrders);
router.get("/customers/:customerId/favourites", getCustomerFavourites);
router.get("/customers/:customerId/rewards", getCustomerRewards);
router.route("/customers/:customerId/notes").get(getCustomerNotes).post(postCustomerNote);
router.route("/customers/:customerId/notes/:noteId").patch(patchCustomerNote).delete(removeCustomerNote);
router.get("/search", searchAdmin);

export default router;
