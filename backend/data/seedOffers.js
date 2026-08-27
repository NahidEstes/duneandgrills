import "dotenv/config";
import mongoose from "mongoose";
import Offer from "../models/Offer.js";
import createOfferSeedData from "./offerSeedData.js";

const run = async () => {
  try {
    const uri =
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017/duneandgrills";
    await mongoose.connect(uri);
    console.log("Connected to MongoDB for offer seeding...");

    await Offer.deleteMany({});
    const inserted = await Offer.insertMany(createOfferSeedData());
    console.log(`Inserted ${inserted.length} offers.`);
  } catch (err) {
    console.error("Offer seeding failed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
