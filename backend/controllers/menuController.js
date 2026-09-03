import MenuItem from "../models/MenuItem.js";
import Combo from "../models/Combo.js";
import { calculateComboPricing } from "../services/catalogService.js";
import {
  CATEGORY_TYPES,
  getPublicCategoryMatch,
  resolveCategory,
  synchronizeLegacyCategories,
} from "../services/categoryService.js";

const refreshComboPrices = async (menuItemId) => {
  const combos = await Combo.find({ "items.menuItem": menuItemId }).populate(
    "items.menuItem"
  );
  await Promise.all(
    combos.map((combo) => {
      combo.set(calculateComboPricing(combo.items, combo.comboPrice));
      return combo.save();
    })
  );
};

// @desc    Get all menu items (optionally filter by category)
// @route   GET /api/menu?category=Food
// @access  Public
export const getMenuItems = async (req, res) => {
  try {
    const { category } = req.query;
    const categoryMatch = await getPublicCategoryMatch(
      CATEGORY_TYPES.MENU,
      category
    );
    const filter = { isAvailable: true, $and: [categoryMatch] };

    const items = await MenuItem.find(filter)
      .populate("categoryRef", "name slug isActive type")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: items.length, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch menu items", error: err.message });
  }
};

// @desc    Get all menu items, including unavailable items
// @route   GET /api/menu/manage
// @access  Admin/Manager
export const getAllMenuItemsForAdmin = async (req, res) => {
  try {
    await synchronizeLegacyCategories();
    const items = await MenuItem.find()
      .populate("categoryRef", "name slug isActive type")
      .sort({ updatedAt: -1 });
    res.status(200).json({ success: true, count: items.length, data: items });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch menu items",
      error: err.message,
    });
  }
};

// @desc    Get a single menu item
// @route   GET /api/menu/:id
// @access  Public
export const getMenuItemById = async (req, res) => {
  try {
    const categoryMatch = await getPublicCategoryMatch(CATEGORY_TYPES.MENU);
    const item = await MenuItem.findOne({
      _id: req.params.id,
      isAvailable: true,
      $and: [categoryMatch],
    }).populate("categoryRef", "name slug isActive type");
    if (!item) {
      return res.status(404).json({ success: false, message: "Menu item not found" });
    }
    res.status(200).json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch menu item", error: err.message });
  }
};

// @desc    Create a menu item
// @route   POST /api/menu
// @access  Admin (add auth middleware in production)
export const createMenuItem = async (req, res) => {
  try {
    const categoryValues = await resolveCategory({
      type: CATEGORY_TYPES.MENU,
      categoryId: req.body.categoryId,
      categoryName: req.body.category,
    });
    const item = await MenuItem.create({ ...req.body, ...categoryValues });
    await item.populate("categoryRef", "name slug isActive type");
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: "Failed to create menu item", error: err.message });
  }
};

// @desc    Update a menu item
// @route   PUT /api/menu/:id
// @access  Admin
export const updateMenuItem = async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Menu item not found" });
    }

    let categoryValues = {};
    if (req.body.categoryId !== undefined || req.body.category !== undefined) {
      const sameCategory = req.body.categoryId
        ? item.categoryRef?.toString() === String(req.body.categoryId)
        : item.category.toLowerCase() ===
          String(req.body.category || "").trim().toLowerCase();
      categoryValues = await resolveCategory({
        type: CATEGORY_TYPES.MENU,
        categoryId: req.body.categoryId,
        categoryName: req.body.category,
        allowInactive: sameCategory,
      });
    }

    item.set({ ...req.body, ...categoryValues });
    await item.save();
    await refreshComboPrices(item._id);
    await item.populate("categoryRef", "name slug isActive type");
    res.status(200).json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: "Failed to update menu item", error: err.message });
  }
};

// @desc    Delete a menu item
// @route   DELETE /api/menu/:id
// @access  Admin
export const deleteMenuItem = async (req, res) => {
  try {
    const referencedCombo = await Combo.findOne({
      "items.menuItem": req.params.id,
    }).select("name");
    if (referencedCombo) {
      return res.status(409).json({
        success: false,
        message: `This menu item is used by “${referencedCombo.name}”. Remove it from the combo first.`,
      });
    }
    const item = await MenuItem.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Menu item not found" });
    }
    res.status(200).json({ success: true, message: "Menu item deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to delete menu item", error: err.message });
  }
};
