import axios from "axios";
import { refreshContentCache } from "@/app/actions/revalidate-content.js";

const API_BASE_URL = "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
});

const refreshAfterMutation = async (contentType) => {
  try {
    await refreshContentCache(contentType);
  } catch {
    // The API proxy also performs server-side invalidation. This action is an
    // additional same-browser Router Cache purge and must not turn a successful
    // database mutation into a false failure in the admin UI.
  }
};

// ---- Restaurant settings ----
export const fetchPublicRestaurantSettings = async () => {
  const { data } = await api.get("/settings/public");
  return data.data;
};

export const fetchRestaurantSettings = async () => {
  const { data } = await api.get("/settings");
  return data.data;
};

export const updateRestaurantSettings = async (payload) => {
  const { data } = await api.put("/settings", payload);
  await refreshAfterMutation("settings");
  return data.data;
};

// Attach the JWT (if present) to every request
api.interceptors.request.use((config) => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("dg_token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (typeof document !== "undefined" && !["get", "head", "options"].includes(String(config.method || "get").toLowerCase())) {
    const csrf = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith("dg_csrf="))?.slice("dg_csrf=".length);
    if (csrf) config.headers["X-CSRF-Token"] = decodeURIComponent(csrf);
  }
  return config;
});

// ---- Menu ----
export const fetchMenuItems = async (category) => {
  const params = category && category !== "All" ? { category } : {};
  const { data } = await api.get("/menu", { params });
  return data.data;
};

export const fetchFeaturedMenuItem = async () => {
  const items = await fetchMenuItems();
  return items.find((item) => item.isFeatured) || items[0] || null;
};

export const createMenuItem = async (payload) => {
  const { data } = await api.post("/menu", payload);
  await refreshAfterMutation("menu");
  return data.data;
};

export const fetchAllMenuItems = async () => {
  const { data } = await api.get("/menu/manage");
  return data.data;
};

export const updateMenuItem = async (id, payload) => {
  const { data } = await api.put(`/menu/${id}`, payload);
  await refreshAfterMutation("menu");
  return data.data;
};

export const deleteMenuItem = async (id) => {
  const { data } = await api.delete(`/menu/${id}`);
  await refreshAfterMutation("menu");
  return data;
};

export const fetchMenuAddOns = async () => {
  const { data } = await api.get("/menu/manage/add-ons");
  return data.data;
};

export const createMenuAddOn = async (payload) => {
  const { data } = await api.post("/menu/manage/add-ons", payload);
  await refreshAfterMutation("menu");
  return data.data;
};

export const updateMenuAddOn = async (id, payload) => {
  const { data } = await api.put(`/menu/manage/add-ons/${id}`, payload);
  await refreshAfterMutation("menu");
  return data.data;
};

export const deleteMenuAddOn = async (id) => {
  const { data } = await api.delete(`/menu/manage/add-ons/${id}`);
  await refreshAfterMutation("menu");
  return data;
};

// ---- Content categories ----
export const fetchCategories = async (type) => {
  const { data } = await api.get("/categories", { params: { type } });
  return data.data;
};

export const fetchManagedCategories = async (type) => {
  const { data } = await api.get("/categories/manage", { params: { type } });
  return data.data;
};

export const createContentCategory = async (payload) => {
  const { data } = await api.post("/categories", payload);
  await refreshAfterMutation(payload.type);
  return data.data;
};

export const updateContentCategory = async (id, payload) => {
  const { data } = await api.patch(`/categories/${id}`, payload);
  await refreshAfterMutation(payload.type);
  return data.data;
};

export const deleteContentCategory = async (id, type) => {
  const { data } = await api.delete(`/categories/${id}`);
  await refreshAfterMutation(type);
  return data;
};

// ---- Combos ----
export const fetchCombos = async () => {
  const { data } = await api.get("/combos");
  return data.data;
};

export const fetchAllCombos = async () => {
  const { data } = await api.get("/combos/manage");
  return data.data;
};

export const createCombo = async (payload) => {
  const { data } = await api.post("/combos", payload);
  await refreshAfterMutation("combos");
  return data.data;
};

export const updateCombo = async (id, payload) => {
  const { data } = await api.put(`/combos/${id}`, payload);
  await refreshAfterMutation("combos");
  return data.data;
};

export const deleteCombo = async (id) => {
  const { data } = await api.delete(`/combos/${id}`);
  await refreshAfterMutation("combos");
  return data;
};

// ---- Offers ----
export const fetchOffers = async () => {
  const { data } = await api.get("/offers");
  return data.data;
};

export const fetchAllOffers = async () => {
  const { data } = await api.get("/offers/manage");
  return data.data;
};

export const createOffer = async (payload) => {
  const { data } = await api.post("/offers", payload);
  await refreshAfterMutation("offers");
  return data.data;
};

export const updateOffer = async (id, payload) => {
  const { data } = await api.put(`/offers/${id}`, payload);
  await refreshAfterMutation("offers");
  return data.data;
};

export const deleteOffer = async (id) => {
  const { data } = await api.delete(`/offers/${id}`);
  await refreshAfterMutation("offers");
  return data;
};

export const validateCoupon = async (code, items) => {
  const { data } = await api.post("/offers/validate-coupon", { code, items });
  return data.data;
};

// ---- Orders ----
export const fetchOrderConfig = async () => {
  const { data } = await api.get("/orders/config");
  return data.data;
};

export const placeOrder = async (orderPayload) => {
  const { data } = await api.post("/orders", orderPayload);
  await refreshAfterMutation("orders");
  return { ...data.data, ...(data.trackingToken ? { trackingToken: data.trackingToken } : {}) };
};

export const fetchMyOrders = async () => {
  const { data } = await api.get("/orders/my");
  return data.data;
};

export const fetchOrders = async (filters = {}) => {
  const params = typeof filters === "string"
    ? (filters && filters !== "all" ? { status: filters } : {})
    : Object.fromEntries(Object.entries(filters).filter(([, value]) => value && value !== "all"));
  const { data } = await api.get("/orders", { params });
  return data.data;
};

export const trackGuestOrder = async (orderNumber, trackingToken) => {
  const { data } = await api.get(`/orders/track/${encodeURIComponent(orderNumber)}`, { headers: { "X-Order-Tracking-Token": trackingToken } });
  return data.data;
};

export const fetchOrdersPage = async (filters = {}) => {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "" && value !== undefined && value !== null && value !== "all"));
  const { data } = await api.get("/orders", { params });
  return { data: data.data, pagination: data.pagination };
};

export const fetchOrderStats = async (filters = {}) => {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value && value !== "all"));
  const { data } = await api.get("/orders/stats", { params });
  return data.data;
};

export const updateOrderStatus = async (id, status, options = {}) => {
  const { data } = await api.patch(`/orders/${id}/status`, { status, ...options });
  await refreshAfterMutation("orders");
  return data.data;
};

export const bulkUpdateOrderStatus = async (orderIds, status, options = {}) => {
  const { data } = await api.patch("/orders/bulk-status", { orderIds, status, ...options });
  await refreshAfterMutation("orders");
  return data.data;
};

export const fetchOrderRefunds = async (orderId) => {
  const { data } = await api.get(`/orders/${orderId}/refunds`);
  return data.data;
};

export const createOrderRefund = async (orderId, payload) => {
  const { data } = await api.post(`/orders/${orderId}/refunds`, payload);
  return data.data;
};

export const transitionOrderRefund = async (refundId, action, payload = {}) => {
  const { data } = await api.post(`/orders/refunds/${refundId}/${action}`, payload);
  return data.data;
};

// ---- Kitchen Display System ----
export const fetchKitchenQueue = async (filters = {}) => {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value && value !== "all"));
  const { data } = await api.get("/kitchen/orders", { params });
  return data;
};

export const updateKitchenOrderStatus = async (id, status, options = {}) => {
  const { data } = await api.patch(`/kitchen/orders/${id}/status`, { status, ...options });
  await refreshAfterMutation("orders");
  return data;
};

// ---- Web POS ----
export const fetchPosSales = async (params = {}) => {
  const { data } = await api.get("/pos/sales", { params });
  return data.data;
};

export const completePosSale = async (payload) => {
  const { data } = await api.post("/pos/sales", payload);
  await refreshAfterMutation("orders");
  return data;
};

export const fetchPosShiftConfig = async () => (await api.get("/pos/shift-config")).data.data;
export const fetchCurrentPosShift = async (terminal = "MAIN") => (await api.get("/pos/shifts/current", { params: { terminal } })).data;
export const openPosShift = async (payload) => (await api.post("/pos/shifts/open", payload)).data.data;
export const addPosCashMovement = async (shiftId, payload) => (await api.post(`/pos/shifts/${shiftId}/cash-movements`, payload)).data.data;
export const closePosShift = async (shiftId, payload) => (await api.post(`/pos/shifts/${shiftId}/close`, payload)).data.data;
export const fetchPosShifts = async (params = {}) => (await api.get("/pos/shifts", { params })).data;
export const fetchPosShift = async (shiftId) => (await api.get(`/pos/shifts/${shiftId}`)).data.data;
export const reopenPosShift = async (shiftId, reason) => (await api.post(`/pos/shifts/${shiftId}/reopen`, { reason })).data.data;

// ---- Persistent cart ----
export const fetchUserCart = async () => {
  const { data } = await api.get("/cart");
  return data.data;
};

export const addItemToCart = async (productId, quantity = 1, productType = "menuItem", customization = undefined) => {
  const { data } = await api.post("/cart", { productId, productType, quantity, customization });
  return data.data;
};

export const updateCartItem = async (productId, quantity, productType = "menuItem", lineId = undefined) => {
  const { data } = await api.patch(`/cart/${productId}`, { quantity }, { params: { productType, lineId } });
  return data.data;
};

export const removeCartItem = async (productId, productType = "menuItem", lineId = undefined) => {
  const { data } = await api.delete(`/cart/${productId}`, { params: { productType, lineId } });
  return data.data;
};

export const clearUserCart = async () => {
  const { data } = await api.delete("/cart");
  return data.data;
};

export const migrateCart = async (items) => {
  const { data } = await api.post("/cart/migrate", { items });
  return data.data;
};

// ---- Dune Rewards ----
export const fetchRewards = async () => {
  const { data } = await api.get("/rewards");
  return data.data;
};

export const fetchRewardAccount = async () => {
  const { data } = await api.get("/rewards/me");
  return data.data;
};

export const redeemReward = async (id) => {
  const { data } = await api.post(`/rewards/${id}/redeem`);
  await refreshAfterMutation("rewards");
  return data.data;
};

export const cancelRewardRedemption = async (redemptionId) => {
  const { data } = await api.delete(`/rewards/redemptions/${redemptionId}`);
  await refreshAfterMutation("rewards");
  return data.data;
};

export const fetchAllRewards = async () => {
  const { data } = await api.get("/rewards/manage");
  return data.data;
};

export const createReward = async (payload) => {
  const { data } = await api.post("/rewards", payload);
  await refreshAfterMutation("rewards");
  return data.data;
};

export const updateReward = async (id, payload) => {
  const { data } = await api.patch(`/rewards/${id}`, payload);
  await refreshAfterMutation("rewards");
  return data.data;
};

export const deleteReward = async (id) => {
  const { data } = await api.delete(`/rewards/${id}`);
  await refreshAfterMutation("rewards");
  return data;
};

// ---- Admin dashboard ----
export const fetchAdminDashboard = async () => {
  const { data } = await api.get("/admin/dashboard");
  return data.data;
};

export const fetchAdminAnalytics = async (params = {}) => {
  const { data } = await api.get("/admin/analytics", { params });
  return data.data;
};

export const fetchAuditLogs = async (params = {}) => {
  const { data } = await api.get("/admin/audit-logs", { params });
  return data;
};

export const fetchAdminUsers = async (scope = "customers", search = "") => {
  const { data } = await api.get("/admin/users", {
    params: { scope, search: search || undefined },
  });
  return data.data;
};

export const fetchStaffAccounts = async () => {
  const { data } = await api.get("/admin/staff");
  return data.data;
};

export const createStaffAccount = async (payload) => {
  const { data } = await api.post("/admin/staff", payload);
  return data.data;
};

export const updateStaffAccount = async (id, payload) => {
  const { data } = await api.patch(`/admin/staff/${id}`, payload);
  return data.data;
};

export const setStaffAccountActive = async (id, active) => {
  const { data } = await api.post(`/admin/staff/${id}/active`, { active });
  return data.data;
};

export const resetStaffAccountPassword = async (id, password) => {
  const { data } = await api.post(`/admin/staff/${id}/reset-password`, { password });
  return data;
};

export const fetchAdminCustomers = async (params = {}) => {
  const { data } = await api.get("/admin/customers", { params });
  return data;
};

export const fetchAdminCustomer = async (customerId) => {
  const { data } = await api.get(`/admin/customers/${customerId}`);
  return data.data;
};

export const fetchAdminCustomerOrders = async (customerId, params = {}) => {
  const { data } = await api.get(`/admin/customers/${customerId}/orders`, { params });
  return data;
};

export const fetchAdminCustomerFavourites = async (customerId) => {
  const { data } = await api.get(`/admin/customers/${customerId}/favourites`);
  return data.data;
};

export const fetchAdminCustomerRewards = async (customerId, params = {}) => {
  const { data } = await api.get(`/admin/customers/${customerId}/rewards`, { params });
  return data;
};

export const fetchAdminCustomerNotes = async (customerId) => {
  const { data } = await api.get(`/admin/customers/${customerId}/notes`);
  return data.data;
};

export const createAdminCustomerNote = async (customerId, text) => {
  const { data } = await api.post(`/admin/customers/${customerId}/notes`, { text });
  return data.data;
};

export const updateAdminCustomerNote = async (customerId, noteId, text) => {
  const { data } = await api.patch(`/admin/customers/${customerId}/notes/${noteId}`, { text });
  return data.data;
};

export const deleteAdminCustomerNote = async (customerId, noteId) => {
  const { data } = await api.delete(`/admin/customers/${customerId}/notes/${noteId}`);
  return data.data;
};

export const searchAdmin = async (query) => {
  const { data } = await api.get("/admin/search", { params: { q: query } });
  return data.data;
};

export const fetchAdminReviews = async () => {
  const { data } = await api.get("/reviews/manage");
  return data.data;
};

export const deleteAdminReview = async (id) => {
  const { data } = await api.delete(`/reviews/${id}`);
  return data;
};

// ---- Auth ----
export const registerUser = async (payload) => {
  const { data } = await api.post("/auth/register", payload);
  return data;
};

export const loginUser = async (payload) => {
  const { data } = await api.post("/auth/login", payload);
  return data;
};

export const fetchMe = async () => {
  const { data } = await api.get("/auth/me");
  return data.user;
};

export const migrateLegacySession = async () => {
  const { data } = await api.post("/auth/migrate-session");
  return data.user;
};

export const logoutUser = async () => {
  await api.post("/auth/logout");
};

export const updateMe = async (payload) => {
  const { data } = await api.patch("/auth/me", payload);
  return data.user;
};

// ---- Account dashboard ----
export const fetchProfileDashboard = async () => {
  const { data } = await api.get("/profile/dashboard");
  return data.data;
};

export const fetchProfileStats = async () => {
  const { data } = await api.get("/profile/stats");
  return data.data;
};

export const fetchFavorites = async () => {
  const { data } = await api.get("/profile/favorites");
  return data.data;
};

export const addFavorite = async (menuItemId) => {
  const { data } = await api.post(`/profile/favorites/${menuItemId}`);
  return data.data;
};

export const removeFavorite = async (menuItemId) => {
  const { data } = await api.delete(`/profile/favorites/${menuItemId}`);
  return data.data;
};

export const addComboFavorite = async (comboId) => {
  const { data } = await api.post(`/profile/favorite-combos/${comboId}`);
  return data.data;
};

export const removeComboFavorite = async (comboId) => {
  const { data } = await api.delete(`/profile/favorite-combos/${comboId}`);
  return data.data;
};

export const fetchSavedBlogPosts = async () => {
  const { data } = await api.get("/profile/saved-posts");
  return data.data;
};

export const saveBlogPost = async (blogPostId) => {
  const { data } = await api.post(`/profile/saved-posts/${blogPostId}`);
  return data.data;
};

export const removeSavedBlogPost = async (blogPostId) => {
  const { data } = await api.delete(`/profile/saved-posts/${blogPostId}`);
  return data.data;
};

export const addAddress = async (payload) => {
  const { data } = await api.post("/profile/addresses", payload);
  return data.data;
};

export const updateAddress = async (id, payload) => {
  const { data } = await api.patch(`/profile/addresses/${id}`, payload);
  return data.data;
};

export const deleteAddress = async (id) => {
  const { data } = await api.delete(`/profile/addresses/${id}`);
  return data.data;
};

export const setDefaultAddress = async (id) => {
  const { data } = await api.patch(`/profile/addresses/${id}/default`);
  return data.data;
};

export const addPaymentMethod = async (payload) => {
  const { data } = await api.post("/profile/payment-methods", payload);
  return data.data;
};

export const updatePaymentMethod = async (id, payload) => {
  const { data } = await api.patch(`/profile/payment-methods/${id}`, payload);
  return data.data;
};

export const deletePaymentMethod = async (id) => {
  const { data } = await api.delete(`/profile/payment-methods/${id}`);
  return data.data;
};

export const setDefaultPaymentMethod = async (id) => {
  const { data } = await api.patch(`/profile/payment-methods/${id}/default`);
  return data.data;
};

export const fetchMyReviews = async () => {
  const { data } = await api.get("/reviews/me");
  return data.data;
};

export const createReview = async (payload) => {
  const { data } = await api.post("/reviews", payload);
  return data.data;
};

// ---- Blog ----
export const fetchBlogPosts = async (category) => {
  const params = category && category !== "All" ? { category } : {};
  const { data } = await api.get("/blog", { params });
  return data.data;
};

export const fetchRecentBlogPosts = async (limit = 3, excludeSlug) => {
  const params = { limit };
  if (excludeSlug) params.excludeSlug = excludeSlug;
  const { data } = await api.get("/blog", { params });
  return data.data;
};

export const fetchBlogCategoryCounts = async () => {
  const { data } = await api.get("/blog/categories");
  return data.data;
};

export const fetchAllBlogPosts = async () => {
  const { data } = await api.get("/blog/manage");
  return data.data;
};

export const fetchBlogPostBySlug = async (slug) => {
  const { data } = await api.get(`/blog/slug/${slug}`);
  return data.data;
};

export const createBlogPost = async (payload) => {
  const { data } = await api.post("/blog", payload);
  await refreshAfterMutation("blog");
  return data.data;
};

export const updateBlogPost = async (id, payload) => {
  const { data } = await api.put(`/blog/${id}`, payload);
  await refreshAfterMutation("blog");
  return data.data;
};

export const deleteBlogPost = async (id) => {
  const { data } = await api.delete(`/blog/${id}`);
  await refreshAfterMutation("blog");
  return data;
};

export default api;
