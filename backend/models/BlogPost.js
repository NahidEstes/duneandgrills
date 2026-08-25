import mongoose from "mongoose";

const blogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    excerpt: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    coverImage: { type: String, required: true },
    category: {
      type: String,
      enum: ["Recipes", "Behind the Scenes", "Nutrition", "News", "Tips"],
      default: "Recipes",
    },
    author: { type: String, default: "Dune & Grills Team" },
    tags: { type: [String], default: [] },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const BlogPost = mongoose.model("BlogPost", blogPostSchema);
export default BlogPost;
