import "dotenv/config";
import mongoose from "mongoose";
import MenuItem from "../models/MenuItem.js";
import seedData from "./seedData.js";

const run = async () => {
  try {
    const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/duneandgrills";
    await mongoose.connect(uri);
    console.log("Connected to MongoDB for seeding...");

    await MenuItem.deleteMany({});
    console.log("Cleared existing menu items.");

    const inserted = await MenuItem.insertMany(seedData);
    console.log(`Inserted ${inserted.length} menu items.`);

    await mongoose.disconnect();
    console.log("Seeding complete. Disconnected.");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
};

run();
