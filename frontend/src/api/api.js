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

// ---- Orders ----
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
  const { data } = await api.put("/auth/me", payload);
  return data.user;
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
  const { data } = await api.get("/blog", { params: { all: true } });
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
