import "dotenv/config";
import mongoose from "mongoose";
import BlogPost from "../models/BlogPost.js";
import blogSeedData from "./blogSeedData.js";

// Same slugify logic used in the blog controller — kept in sync so seeded
// posts get the same slugs the app would generate on creation.
const slugify = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");

const run = async () => {
  try {
    const uri =
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017/duneandgrills";
    await mongoose.connect(uri);
    console.log("Connected to MongoDB for blog seeding...");

    await BlogPost.deleteMany({});
    console.log("Cleared existing blog posts.");

    const withSlugs = blogSeedData.map((post) => ({
      ...post,
      slug: slugify(post.title),
    }));

    const inserted = await BlogPost.insertMany(withSlugs);
    console.log(`Inserted ${inserted.length} blog posts.`);

    await mongoose.disconnect();
    console.log("Blog seeding complete. Disconnected.");
    process.exit(0);
  } catch (err) {
    console.error("Blog seeding failed:", err);
    process.exit(1);
  }
};

run();
