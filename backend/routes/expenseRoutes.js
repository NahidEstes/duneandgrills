import express from "express";
import {
  archiveExpense,
  archiveExpenseCategory,
  archiveRecurringExpense,
  createExpense,
  createExpenseCategory,
  createRecurringExpense,
  exportExpenses,
  generateRecurringExpenses,
  getExpense,
  getExpenseDashboard,
  getExpenseReports,
  listExpenseCategories,
  listExpenses,
  listRecurringExpenses,
  updateExpense,
  updateExpenseCategory,
  updateRecurringExpense,
} from "../controllers/expenseController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";

const router = express.Router();
const writeAccess = requireCapability(CAPABILITIES.FINANCE_WRITE);

router.use(protect, requireCapability(CAPABILITIES.FINANCE_READ));
router.get("/dashboard", getExpenseDashboard);
router.get("/reports", getExpenseReports);
router.get("/entries/export", exportExpenses);
router.route("/entries").get(listExpenses).post(writeAccess, createExpense);
router.post("/entries/:id/archive", writeAccess, archiveExpense);
router.route("/entries/:id").get(getExpense).patch(writeAccess, updateExpense);

router.route("/categories").get(listExpenseCategories).post(writeAccess, createExpenseCategory);
router.post("/categories/:id/archive", writeAccess, archiveExpenseCategory);
router.patch("/categories/:id", writeAccess, updateExpenseCategory);

router.get("/recurring", listRecurringExpenses);
router.post("/recurring/generate", writeAccess, generateRecurringExpenses);
router.route("/recurring").post(writeAccess, createRecurringExpense);
router.post("/recurring/:id/archive", writeAccess, archiveRecurringExpense);
router.patch("/recurring/:id", writeAccess, updateRecurringExpense);

export default router;
