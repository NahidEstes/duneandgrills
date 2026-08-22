import axios from "axios";

// Base URL points at the Express API. Override with VITE_API_URL in a
// frontend .env file when deploying (e.g. VITE_API_URL=https://api.duneandgrills.com/api).
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// ---- Menu ----
export const fetchMenuItems = async (category) => {
  const params = category && category !== "All" ? { category } : {};
  const { data } = await api.get("/menu", { params });
  return data.data;
};

// ---- Orders ----
export const placeOrder = async (orderPayload) => {
  const { data } = await api.post("/orders", orderPayload);
  return data.data;
};

export default api;
