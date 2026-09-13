import express from "express";
import {
  getAdminUsers,
  getDashboard,
  searchAdmin,
} from "../controllers/adminController.js";
import { authorize, protect } from "../middleware/auth.js";
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

router.use(protect, authorize("admin", "manager"));
router.get("/dashboard", getDashboard);
router.get("/analytics", getAdminAnalytics);
router.get("/audit-logs", listAuditLogs);
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
