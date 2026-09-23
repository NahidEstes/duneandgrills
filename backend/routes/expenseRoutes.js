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
import { authorize, protect } from "../middleware/auth.js";

const router = express.Router();
const adminOnly = authorize("admin");

router.use(protect, authorize("admin", "manager"));
router.get("/dashboard", getExpenseDashboard);
router.get("/reports", getExpenseReports);
router.get("/entries/export", exportExpenses);
router.route("/entries").get(listExpenses).post(adminOnly, createExpense);
router.post("/entries/:id/archive", adminOnly, archiveExpense);
router.route("/entries/:id").get(getExpense).patch(adminOnly, updateExpense);

router.route("/categories").get(listExpenseCategories).post(adminOnly, createExpenseCategory);
router.post("/categories/:id/archive", adminOnly, archiveExpenseCategory);
router.patch("/categories/:id", adminOnly, updateExpenseCategory);

router.get("/recurring", listRecurringExpenses);
router.post("/recurring/generate", adminOnly, generateRecurringExpenses);
router.route("/recurring").post(adminOnly, createRecurringExpense);
router.post("/recurring/:id/archive", adminOnly, archiveRecurringExpense);
router.patch("/recurring/:id", adminOnly, updateRecurringExpense);

export default router;
