import mongoose from "mongoose";
import BlogPost from "../models/BlogPost.js";
import ContentCategory from "../models/ContentCategory.js";
import MenuItem from "../models/MenuItem.js";
import Offer from "../models/Offer.js";

export const CATEGORY_TYPES = Object.freeze({
  MENU: "menu",
  BLOG: "blog",
});

const modelForType = (type) => {
  if (type === CATEGORY_TYPES.MENU) return MenuItem;
  if (type === CATEGORY_TYPES.BLOG) return BlogPost;
  throw new Error("Category type must be menu or blog");
};

export const normalizeCategoryType = (value) => {
  const type = String(value || "").trim().toLowerCase();
  return Object.values(CATEGORY_TYPES).includes(type) ? type : null;
};

const normalizeName = (value) =>
  String(value || "").trim().replace(/\s+/g, " ");

let synchronizationPromise;

export const synchronizeLegacyCategories = async () => {
  if (synchronizationPromise) return synchronizationPromise;

  synchronizationPromise = (async () => {
    const summary = { created: 0, linkedMenuItems: 0, linkedBlogPosts: 0 };

    for (const type of Object.values(CATEGORY_TYPES)) {
      const Model = modelForType(type);
      const names = (await Model.distinct("category"))
        .map(normalizeName)
        .filter(Boolean);

      for (const [index, name] of names.entries()) {
        const result = await ContentCategory.updateOne(
          { type, normalizedName: name.toLowerCase() },
          {
            $setOnInsert: {
              type,
              name,
              normalizedName: name.toLowerCase(),
              slug: name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, ""),
              isActive: true,
              sortOrder: index,
            },
          },
          { upsert: true }
        );
        if (result.upsertedCount) summary.created += 1;
      }

      const categories = await ContentCategory.find({ type }).lean();
      for (const category of categories) {
        const result = await Model.updateMany(
          {
            category: category.name,
            $or: [
              { categoryRef: { $exists: false } },
              { categoryRef: null },
            ],
          },
          { $set: { categoryRef: category._id } }
        );
        const key =
          type === CATEGORY_TYPES.MENU
            ? "linkedMenuItems"
            : "linkedBlogPosts";
        summary[key] += result.modifiedCount;
      }
    }

    return summary;
  })().catch((error) => {
    synchronizationPromise = undefined;
    throw error;
  });

  return synchronizationPromise;
};

export const resolveCategory = async ({
  type,
  categoryId,
  categoryName,
  allowInactive = false,
}) => {
  await synchronizeLegacyCategories();
  const normalizedType = normalizeCategoryType(type);
  if (!normalizedType) throw new Error("Invalid category type");

  let category;
  if (categoryId) {
    if (!mongoose.isValidObjectId(categoryId)) {
      throw new Error("Invalid category");
    }
    category = await ContentCategory.findOne({
      _id: categoryId,
      type: normalizedType,
    });
  } else {
    const name = normalizeName(categoryName);
    category = name
      ? await ContentCategory.findOne({
          type: normalizedType,
          normalizedName: name.toLowerCase(),
        })
      : null;
  }

  if (!category) throw new Error("Category not found");
  if (!allowInactive && !category.isActive) {
    throw new Error("Choose an active category");
  }

  return { category: category.name, categoryRef: category._id };
};

export const getPublicCategoryMatch = async (type, requestedCategory) => {
  await synchronizeLegacyCategories();
  const normalizedType = normalizeCategoryType(type);
  if (!normalizedType) throw new Error("Invalid category type");

  const filter = { type: normalizedType, isActive: true };
  if (requestedCategory && requestedCategory !== "All") {
    const requested = normalizeName(requestedCategory).toLowerCase();
    filter.$or = [{ normalizedName: requested }, { slug: requested }];
  }

  const categories = await ContentCategory.find(filter).select("_id name").lean();
  if (!categories.length) return { _id: { $exists: false } };

  return {
    $or: [
      { categoryRef: { $in: categories.map((entry) => entry._id) } },
      { category: { $in: categories.map((entry) => entry.name) } },
    ],
  };
};

export const categoryUsage = async (category) => {
  const Model = modelForType(category.type);
  const relation = {
    $or: [{ categoryRef: category._id }, { category: category.name }],
  };
  const visibleRelation =
    category.type === CATEGORY_TYPES.MENU
      ? { ...relation, isAvailable: true }
      : { ...relation, isPublished: true };

  const [count, visibleCount, offerCount] = await Promise.all([
    Model.countDocuments(relation),
    category.isActive
      ? Model.countDocuments(visibleRelation)
      : Promise.resolve(0),
    category.type === CATEGORY_TYPES.MENU
      ? Offer.countDocuments({
          couponScope: "category",
          applicableCategory: category.name,
        })
      : 0,
  ]);

  return { count, visibleCount, offerCount };
};

export const serializeCategory = async (category) => {
  const plain =
    typeof category.toObject === "function" ? category.toObject() : category;
  const usage = await categoryUsage(plain);
  return {
    ...plain,
    itemCount: usage.count,
    visibleCount: usage.visibleCount,
    offerCount: usage.offerCount,
  };
};

export const renameCategoryRelations = async (category, previousName) => {
  const Model = modelForType(category.type);
  await Model.updateMany(
    {
      $or: [
        { categoryRef: category._id },
        { category: previousName },
      ],
    },
    {
      $set: {
        category: category.name,
        categoryRef: category._id,
      },
    }
  );

  if (category.type === CATEGORY_TYPES.MENU) {
    await Offer.updateMany(
      { couponScope: "category", applicableCategory: previousName },
      { $set: { applicableCategory: category.name } }
    );
  }
};
