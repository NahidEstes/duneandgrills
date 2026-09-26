import dns from "dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);
import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import mongoose from "mongoose";

import menuRoutes from "./routes/menuRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import blogRoutes from "./routes/blogRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import offerRoutes from "./routes/offerRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import rewardRoutes from "./routes/rewardRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import comboRoutes from "./routes/comboRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import posRoutes from "./routes/posRoutes.js";
import kitchenRoutes from "./routes/kitchenRoutes.js";
import restaurantSettingsRoutes from "./routes/restaurantSettingsRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import { csrfProtection, requestCorrelation, securityHeaders } from "./middleware/security.js";
import { verifyTransactionCapability } from "./services/inventoryStockService.js";

const app = express();

const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/duneandgrills";
const ALLOWED_ORIGINS = new Set(
  (process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || "http://localhost:3000")
    .split(",").map((value) => value.trim()).filter(Boolean)
);

let mongoConnectionPromise;

const connectToMongo = () => {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }

  if (!mongoConnectionPromise || mongoose.connection.readyState === 0) {
    mongoConnectionPromise = mongoose.connect(MONGO_URI).catch((error) => {
      mongoConnectionPromise = undefined;
      throw error;
    });
  }

  return mongoConnectionPromise;
};

// Middleware
app.set("trust proxy", 1);
app.use(securityHeaders);
app.use(requestCorrelation);
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed"));
  },
}));
app.use(express.json());
app.use(morgan("dev"));
app.use(async (req, res, next) => {
  try {
    await connectToMongo();
    next();
  } catch (error) {
    next(error);
  }
});
app.use(csrfProtection);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/blog", blogRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/rewards", rewardRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/combos", comboRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/pos", posRoutes);
app.use("/api/kitchen", kitchenRoutes);
app.use("/api/settings", restaurantSettingsRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/attendance", attendanceRoutes);

app.get("/api/health", (req, res) => {
  res
    .status(200)
    .json({ success: true, message: "Dune & Grills API is running" });
});

app.get("/api/readiness", async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) throw new Error("Database is not connected");
    const transaction = await verifyTransactionCapability();
    res.status(transaction.ready ? 200 : 503).json({ success: transaction.ready, database: "connected", transaction });
  } catch (error) {
    res.status(503).json({ success: false, message: "Service is not ready", database: "unavailable", transaction: { ready: false } });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Server error",
    ...(err.fields ? { fields: err.fields } : {}),
  });
});

if (!process.env.VERCEL) {
  connectToMongo()
    .then(async () => {
      console.log("MongoDB connected.");
      const transaction = await verifyTransactionCapability();
      if (process.env.NODE_ENV === "production" && !transaction.ready) {
        throw new Error("Production startup refused: MongoDB transactions are unavailable");
      }
      if (!transaction.ready) console.warn("Inventory transactions are unavailable; critical inventory operations will fail closed.");
      app.listen(PORT, () => {
        console.log(`Dune & Grills API listening on http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      console.error("Failed to connect to MongoDB:", error.message);
      process.exitCode = 1;
    });
}

export default app;
