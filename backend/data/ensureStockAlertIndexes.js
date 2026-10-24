import "dotenv/config";
import mongoose from "mongoose";
import { stockAlertModels } from "../models/StockAlert.js";

// Explicit additive migration: never sync/drop existing indexes or rewrite stock.
if (!process.env.MONGO_URI) throw Error("Set MONGO_URI for the intended environment before running this migration");
try {
  await mongoose.connect(process.env.MONGO_URI);
  for (const model of stockAlertModels) { await model.createCollection(); await model.createIndexes(); }
  console.log("Stock alert collections and indexes are ready. Inventory balances and existing rules are unchanged.");
} finally { await mongoose.disconnect(); }
