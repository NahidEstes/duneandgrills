import ContentCategory from "../models/ContentCategory.js";
import {
  categoryUsage,
  normalizeCategoryType,
  renameCategoryRelations,
  serializeCategory,
  synchronizeLegacyCategories,
} from "../services/categoryService.js";

const parseType = (req, res) => {
  const type = normalizeCategoryType(req.query.type || req.body.type);
  if (!type) {
    res.status(400).json({
      success: false,
      message: "Category type must be menu or blog",
    });
    return null;
  }
  return type;
};

const categoryPayload = (body) => {
  const payload = {};
  if (body.name !== undefined) payload.name = body.name;
  if (body.description !== undefined) payload.description = body.description;
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      throw new Error("Category status must be true or false");
    }
    payload.isActive = body.isActive;
  }
  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      throw new Error("Display order must be a non-negative whole number");
    }
    payload.sortOrder = sortOrder;
  }
  return payload;
};

const duplicateMessage = (error) =>
  error?.code === 11000 ? "A category with this name already exists" : null;

export const getPublicCategories = async (req, res) => {
  try {
    const type = parseType(req, res);
    if (!type) return;
    await synchronizeLegacyCategories();
    const categories = await ContentCategory.find({ type, isActive: true }).sort({
      sortOrder: 1,
      name: 1,
    });
    const data = await Promise.all(categories.map(serializeCategory));
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load categories",
      error: error.message,
    });
  }
};

export const getManagedCategories = async (req, res) => {
  try {
    const type = parseType(req, res);
    if (!type) return;
    await synchronizeLegacyCategories();
    const categories = await ContentCategory.find({ type }).sort({
      sortOrder: 1,
      name: 1,
    });
    const data = await Promise.all(categories.map(serializeCategory));
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load category management",
      error: error.message,
    });
  }
};

export const createCategory = async (req, res) => {
  try {
    const type = parseType(req, res);
    if (!type) return;
    await synchronizeLegacyCategories();
    const category = await ContentCategory.create({
      type,
      ...categoryPayload(req.body),
    });
    res.status(201).json({
      success: true,
      data: await serializeCategory(category),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message:
        duplicateMessage(error) || error.message || "Failed to create category",
      error: error.message,
    });
  }
};

export const updateCategory = async (req, res) => {
  try {
    await synchronizeLegacyCategories();
    const category = await ContentCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const requestedType = req.body.type
      ? normalizeCategoryType(req.body.type)
      : category.type;
    if (!requestedType || requestedType !== category.type) {
      return res.status(400).json({
        success: false,
        message: "A category cannot be moved between menu and blog systems",
      });
    }

    const previousName = category.name;
    category.set(categoryPayload(req.body));
    await category.save();
    if (category.name !== previousName) {
      await renameCategoryRelations(category, previousName);
    }

    return res.status(200).json({
      success: true,
      data: await serializeCategory(category),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message:
        duplicateMessage(error) || error.message || "Failed to update category",
      error: error.message,
    });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    await synchronizeLegacyCategories();
    const category = await ContentCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const usage = await categoryUsage(category);
    if (usage.count || usage.offerCount) {
      const contentLabel = category.type === "menu" ? "menu items" : "blog posts";
      return res.status(409).json({
        success: false,
        message: `Cannot delete “${category.name}” while it is used by ${usage.count} ${contentLabel}${usage.offerCount ? ` and ${usage.offerCount} offers` : ""}. Reassign them first.`,
      });
    }

    await category.deleteOne();
    return res.status(200).json({
      success: true,
      message: "Category deleted",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete category",
      error: error.message,
    });
  }
};
