import api from "./api.js";

const unwrap = (request) => request.then(({ data }) => data);

export const fetchExpenseDashboard = (params = {}) => unwrap(api.get("/expenses/dashboard", { params })).then((row) => row.data);
export const fetchExpenseReports = (params = {}) => unwrap(api.get("/expenses/reports", { params })).then((row) => row.data);
export const fetchExpenses = (params = {}) => unwrap(api.get("/expenses/entries", { params }));
export const exportExpenses = (params = {}) => unwrap(api.get("/expenses/entries/export", { params }));
export const createExpense = (payload) => unwrap(api.post("/expenses/entries", payload)).then((row) => row.data);
export const updateExpense = (id, payload) => unwrap(api.patch(`/expenses/entries/${id}`, payload)).then((row) => row.data);
export const archiveExpense = (id, payload = {}) => unwrap(api.post(`/expenses/entries/${id}/archive`, payload));

export const fetchExpenseCategories = (includeInactive = false) => unwrap(api.get("/expenses/categories", { params: { includeInactive } })).then((row) => row.data);
export const createExpenseCategory = (payload) => unwrap(api.post("/expenses/categories", payload)).then((row) => row.data);
export const updateExpenseCategory = (id, payload) => unwrap(api.patch(`/expenses/categories/${id}`, payload)).then((row) => row.data);
export const archiveExpenseCategory = (id) => unwrap(api.post(`/expenses/categories/${id}/archive`));

export const fetchRecurringExpenses = (params = {}) => unwrap(api.get("/expenses/recurring", { params })).then((row) => row.data);
export const createRecurringExpense = (payload) => unwrap(api.post("/expenses/recurring", payload)).then((row) => row.data);
export const updateRecurringExpense = (id, payload) => unwrap(api.patch(`/expenses/recurring/${id}`, payload)).then((row) => row.data);
export const archiveRecurringExpense = (id) => unwrap(api.post(`/expenses/recurring/${id}/archive`));
export const generateRecurringExpenses = (throughDate) => unwrap(api.post("/expenses/recurring/generate", { throughDate })).then((row) => row.data);
