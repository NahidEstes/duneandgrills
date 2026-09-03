import axios from "axios";
import { refreshContentCache } from "@/app/actions/revalidate-content.js";

const API_BASE_URL = "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
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

// Attach the JWT (if present) to every request
api.interceptors.request.use((config) => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("dg_token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
  return data.data;
};

export const fetchMyOrders = async () => {
  const { data } = await api.get("/orders/my");
  return data.data;
};

export const fetchOrders = async (status) => {
  const params = status && status !== "all" ? { status } : {};
  const { data } = await api.get("/orders", { params });
  return data.data;
};

export const fetchOrderStats = async () => {
  const { data } = await api.get("/orders/stats");
  return data.data;
};

export const updateOrderStatus = async (id, status) => {
  const { data } = await api.patch(`/orders/${id}/status`, { status });
  await refreshAfterMutation("orders");
  return data.data;
};

// ---- Persistent cart ----
export const fetchUserCart = async () => {
  const { data } = await api.get("/cart");
  return data.data;
};

export const addItemToCart = async (productId, quantity = 1, productType = "menuItem") => {
  const { data } = await api.post("/cart", { productId, productType, quantity });
  return data.data;
};

export const updateCartItem = async (productId, quantity, productType = "menuItem") => {
  const { data } = await api.patch(`/cart/${productId}`, { quantity }, { params: { productType } });
  return data.data;
};

export const removeCartItem = async (productId, productType = "menuItem") => {
  const { data } = await api.delete(`/cart/${productId}`, { params: { productType } });
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

export const fetchAdminUsers = async (scope = "customers", search = "") => {
  const { data } = await api.get("/admin/users", {
    params: { scope, search: search || undefined },
  });
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
