import MenuItem from "../models/MenuItem.js";

// @desc    Get all menu items (optionally filter by category)
// @route   GET /api/menu?category=Food
// @access  Public
export const getMenuItems = async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { isAvailable: true };
    if (category) filter.category = category;

    const items = await MenuItem.find(filter).sort({ createdAt: -1 });
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
    const items = await MenuItem.find().sort({ updatedAt: -1 });
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
    const item = await MenuItem.findById(req.params.id);
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
    const item = await MenuItem.create(req.body);
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
    const item = await MenuItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!item) {
      return res.status(404).json({ success: false, message: "Menu item not found" });
    }
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
    const item = await MenuItem.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Menu item not found" });
    }
    res.status(200).json({ success: true, message: "Menu item deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to delete menu item", error: err.message });
  }
};
