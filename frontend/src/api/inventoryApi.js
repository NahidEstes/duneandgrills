import api from "./api.js";

const unwrap = (request) => request.then(({ data }) => data);

export const fetchInventoryDashboard = () => unwrap(api.get("/inventory/dashboard")).then((response) => response.data);
export const fetchInventoryAlerts = () => unwrap(api.get("/inventory/alerts")).then((response) => response.data);

export const fetchInventoryItems = (params = {}) => unwrap(api.get("/inventory/items", { params }));
export const fetchInventoryBatches = (params = {}) => unwrap(api.get("/inventory/batches", { params }));
export const fetchInventoryItem = (id) => unwrap(api.get(`/inventory/items/${id}`)).then((response) => response.data);
export const createInventoryItem = (payload) => unwrap(api.post("/inventory/items", payload)).then((response) => response.data);
export const updateInventoryItem = (id, payload) => unwrap(api.patch(`/inventory/items/${id}`, payload)).then((response) => response.data);
export const archiveInventoryItem = (id) => unwrap(api.delete(`/inventory/items/${id}`));
export const fetchItemHistory = (id, params = {}) => unwrap(api.get(`/inventory/items/${id}/history`, { params }));

export const fetchInventoryCategories = (includeInactive = false) =>
  unwrap(api.get("/inventory/categories", { params: { includeInactive } })).then((response) => response.data);
export const fetchInventorySkuSuggestion = (categoryId) =>
  unwrap(api.get(`/inventory/categories/${categoryId}/sku-suggestion`)).then((response) => response.data);
export const createInventoryCategory = (payload) => unwrap(api.post("/inventory/categories", payload)).then((response) => response.data);
export const updateInventoryCategory = (id, payload) => unwrap(api.patch(`/inventory/categories/${id}`, payload)).then((response) => response.data);
export const archiveInventoryCategory = (id) => unwrap(api.delete(`/inventory/categories/${id}`));

export const fetchSuppliers = (params = {}) => unwrap(api.get("/inventory/suppliers", { params })).then((response) => response.data);
export const createSupplier = (payload) => unwrap(api.post("/inventory/suppliers", payload)).then((response) => response.data);
export const updateSupplier = (id, payload) => unwrap(api.patch(`/inventory/suppliers/${id}`, payload)).then((response) => response.data);
export const archiveSupplier = (id) => unwrap(api.delete(`/inventory/suppliers/${id}`));
export const fetchSupplierPurchases = (id) => unwrap(api.get(`/inventory/suppliers/${id}/purchases`)).then((response) => response.data);

export const fetchStockMovements = (params = {}) => unwrap(api.get("/inventory/movements", { params }));
export const createStockMovement = (payload) => unwrap(api.post("/inventory/movements", payload)).then((response) => response.data);

export const fetchInventoryRecipes = (params = {}) => unwrap(api.get("/inventory/recipes", { params }));
export const fetchInventoryRecipe = (menuItemId) => unwrap(api.get(`/inventory/recipes/${menuItemId}`)).then((response) => response.data);
export const updateInventoryRecipe = (menuItemId, payload) => unwrap(api.put(`/inventory/recipes/${menuItemId}`, payload)).then((response) => response.data);
export const fetchAddOnInventoryRecipes = () => unwrap(api.get("/inventory/add-on-recipes")).then((response) => response);
export const fetchAddOnInventoryRecipe = (addOnId) => unwrap(api.get(`/inventory/add-on-recipes/${addOnId}`)).then((response) => response.data);
export const updateAddOnInventoryRecipe = (addOnId, payload) => unwrap(api.put(`/inventory/add-on-recipes/${addOnId}`, payload)).then((response) => response.data);

export const fetchWasteRecords = (params = {}) => unwrap(api.get("/inventory/waste", { params }));
export const createWasteRecord = (payload) => unwrap(api.post("/inventory/waste", payload)).then((response) => response.data);

export const fetchPurchaseOrders = (params = {}) => unwrap(api.get("/inventory/purchase-orders", { params }));
export const fetchPurchaseOrder = (id) => unwrap(api.get(`/inventory/purchase-orders/${id}`)).then((response) => response.data);
export const createPurchaseOrder = (payload) => unwrap(api.post("/inventory/purchase-orders", payload)).then((response) => response.data);
export const updatePurchaseOrder = (id, payload) => unwrap(api.patch(`/inventory/purchase-orders/${id}`, payload)).then((response) => response.data);
export const updatePurchaseOrderStatus = (id, status, options = {}) => unwrap(api.patch(`/inventory/purchase-orders/${id}/status`, { status, ...options })).then((response) => response.data);
export const receivePurchaseOrder = (id, payload) => unwrap(api.post(`/inventory/purchase-orders/${id}/receive`, payload)).then((response) => response.data);
export const fetchSupplierInvoices = (params = {}) => unwrap(api.get("/inventory/supplier-invoices", { params }));
export const fetchSupplierInvoice = (id) => unwrap(api.get(`/inventory/supplier-invoices/${id}`));
export const createSupplierInvoice = (payload) => unwrap(api.post("/inventory/supplier-invoices", payload)).then((response) => response.data);
export const updateSupplierInvoice = (id, payload) => unwrap(api.patch(`/inventory/supplier-invoices/${id}`, payload)).then((response) => response.data);
export const updateSupplierInvoiceStatus = (id, status, options = {}) => unwrap(api.patch(`/inventory/supplier-invoices/${id}/status`, { status, ...options })).then((response) => response.data);
export const createSupplierPayment = (id, payload) => unwrap(api.post(`/inventory/supplier-invoices/${id}/payments`, payload)).then((response) => response.data);
export const reverseSupplierPayment = (id, reason) => unwrap(api.post(`/inventory/supplier-payments/${id}/reverse`, { reason })).then((response) => response.data);
export const fetchPurchasePriceHistory = (params = {}) => unwrap(api.get("/inventory/purchase-price-history", { params })).then((response) => response.data);

export const fetchReorderSuggestions = (params = {}) => unwrap(api.get("/inventory/reorder-suggestions", { params }));
export const recalculateReorderSuggestions = (item = null) => unwrap(api.post("/inventory/reorder-suggestions/recalculate", item ? { item } : {})).then((response) => response.data);
export const reviewReorderSuggestion = (id, payload) => unwrap(api.patch(`/inventory/reorder-suggestions/${id}/review`, payload)).then((response) => response.data);
export const dismissReorderSuggestion = (id, payload) => unwrap(api.patch(`/inventory/reorder-suggestions/${id}/dismiss`, payload)).then((response) => response.data);
export const generateReorderDrafts = (payload) => unwrap(api.post("/inventory/reorder-suggestions/generate-drafts", payload)).then((response) => response.data);
export const fetchPurchasingActions = (params = {}) => unwrap(api.get("/inventory/purchasing-actions", { params }));
export const refreshPurchasingActions = () => unwrap(api.post("/inventory/purchasing-actions/refresh")).then((response) => response.data);
export const updatePurchasingActionState = (id, payload) => unwrap(api.patch(`/inventory/purchasing-actions/${id}/state`, payload)).then((response) => response.data);

export const fetchInventoryCounts = () => unwrap(api.get("/inventory/counts")).then((response) => response.data);
export const createInventoryCount = (payload) => unwrap(api.post("/inventory/counts", payload)).then((response) => response.data);
export const completeInventoryCount = (id, items) => unwrap(api.post(`/inventory/counts/${id}/complete`, { items })).then((response) => response.data);
export const submitInventoryCount = (id, items) => unwrap(api.post(`/inventory/counts/${id}/submit`, { items })).then((response) => response.data);
export const reviewInventoryCount = (id) => unwrap(api.post(`/inventory/counts/${id}/review`)).then((response) => response.data);
export const cancelInventoryCount = (id) => unwrap(api.post(`/inventory/counts/${id}/cancel`)).then((response) => response.data);

export const fetchInventoryReport = (params = {}) => unwrap(api.get("/inventory/reports", { params }));
export const fetchInventorySettings = () => unwrap(api.get("/inventory/settings")).then((response) => response.data);
export const updateInventorySettings = (payload) => unwrap(api.patch("/inventory/settings", payload)).then((response) => response.data);
