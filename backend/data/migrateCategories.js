import "dotenv/config";
import mongoose from "mongoose";
import { synchronizeLegacyCategories } from "../services/categoryService.js";

const uri =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/duneandgrills";

try {
  await mongoose.connect(uri);
  const summary = await synchronizeLegacyCategories();
  console.log("Category migration complete:", summary);
} catch (error) {
  console.error("Category migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
