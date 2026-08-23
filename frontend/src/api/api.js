import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach the JWT (if present) to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("dg_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ---- Menu ----
export const fetchMenuItems = async (category) => {
  const params = category && category !== "All" ? { category } : {};
  const { data } = await api.get("/menu", { params });
  return data.data;
};

export const createMenuItem = async (payload) => {
  const { data } = await api.post("/menu", payload);
  return data.data;
};

export const updateMenuItem = async (id, payload) => {
  const { data } = await api.put(`/menu/${id}`, payload);
  return data.data;
};

export const deleteMenuItem = async (id) => {
  const { data } = await api.delete(`/menu/${id}`);
  return data;
};

// ---- Orders ----
export const placeOrder = async (orderPayload) => {
  const { data } = await api.post("/orders", orderPayload);
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

export default api;
