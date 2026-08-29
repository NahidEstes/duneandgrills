import mongoose from "mongoose";
import MenuItem from "../models/MenuItem.js";
import UserCart, { MAX_CART_QUANTITY } from "../models/UserCart.js";

const menuItemPopulation = {
  path: "items.menuItem",
  match: { isAvailable: true },
  select:
    "name description price category image tags isAvailable isFeatured calories ingredients",
};

const parseQuantity = (value) => {
  const quantity = Number(value);
  return Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= MAX_CART_QUANTITY
    ? quantity
    : null;
};

const getOrCreateCart = async (userId) => {
  const existing = await UserCart.findOne({ userId });
  if (existing) return existing;

  try {
    return await UserCart.create({ userId, items: [] });
  } catch (error) {
    if (error?.code === 11000) return UserCart.findOne({ userId });
    throw error;
  }
};

const cartResponseItems = async (cart) => {
  await cart.populate(menuItemPopulation);
  const availableItems = cart.items.filter((item) => item.menuItem);

  if (availableItems.length !== cart.items.length) {
    cart.items = availableItems;
    await cart.save();
  }

  return availableItems.map((item) => ({
    ...item.menuItem.toObject(),
    quantity: item.quantity,
  }));
};

const sendCart = async (res, cart, status = 200) =>
  res.status(status).json({
    success: true,
    data: await cartResponseItems(cart),
  });

const findAvailableMenuItem = async (menuItemId) => {
  if (!mongoose.isValidObjectId(menuItemId)) return null;
  return MenuItem.findOne({
    _id: menuItemId,
    isAvailable: true,
  }).select("_id");
};

export const getCart = async (req, res) => {
  try {
    return sendCart(res, await getOrCreateCart(req.user._id));
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load your cart",
      error: error.message,
    });
  }
};

export const addToCart = async (req, res) => {
  try {
    const menuItemId = req.body.menuItem || req.body.menuItemId;
    const quantity = parseQuantity(req.body.quantity ?? 1);
    if (!mongoose.isValidObjectId(menuItemId) || !quantity) {
      return res.status(400).json({
        success: false,
        message: `A valid menu item and quantity from 1 to ${MAX_CART_QUANTITY} are required`,
      });
    }

    const menuItem = await findAvailableMenuItem(menuItemId);
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: "Menu item was not found or is unavailable",
      });
    }

    const cart = await getOrCreateCart(req.user._id);
    const existing = cart.items.find(
      (item) => item.menuItem.toString() === menuItemId.toString()
    );

    if (existing) {
      if (existing.quantity + quantity > MAX_CART_QUANTITY) {
        return res.status(400).json({
          success: false,
          message: `Cart quantity cannot exceed ${MAX_CART_QUANTITY}`,
        });
      }
      existing.quantity += quantity;
    } else {
      cart.items.push({ menuItem: menuItem._id, quantity });
    }

    await cart.save();
    return sendCart(res, cart, existing ? 200 : 201);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to add item to cart",
      error: error.message,
    });
  }
};

export const updateItem = async (req, res) => {
  try {
    const { menuItemId } = req.params;
    const quantity = parseQuantity(req.body.quantity);
    if (!mongoose.isValidObjectId(menuItemId) || !quantity) {
      return res.status(400).json({
        success: false,
        message: `A valid menu item and quantity from 1 to ${MAX_CART_QUANTITY} are required`,
      });
    }

    const menuItem = await findAvailableMenuItem(menuItemId);
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: "Menu item was not found or is unavailable",
      });
    }

    const cart = await getOrCreateCart(req.user._id);
    const item = cart.items.find(
      (entry) => entry.menuItem.toString() === menuItemId
    );
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item is not in your cart",
      });
    }

    item.quantity = quantity;
    await cart.save();
    return sendCart(res, cart);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to update cart item",
      error: error.message,
    });
  }
};

export const removeItem = async (req, res) => {
  try {
    const { menuItemId } = req.params;
    if (!mongoose.isValidObjectId(menuItemId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item",
      });
    }

    const cart = await getOrCreateCart(req.user._id);
    const originalLength = cart.items.length;
    cart.items = cart.items.filter(
      (item) => item.menuItem.toString() !== menuItemId
    );
    if (cart.items.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: "Item is not in your cart",
      });
    }

    await cart.save();
    return sendCart(res, cart);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to remove cart item",
      error: error.message,
    });
  }
};

export const clearCart = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user._id);
    cart.items = [];
    await cart.save();
    return sendCart(res, cart);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to clear your cart",
      error: error.message,
    });
  }
};

export const migrateCart = async (req, res) => {
  try {
    const incoming = req.body.items ?? [];
    if (!Array.isArray(incoming) || incoming.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Cart migration items must be an array of at most 100 items",
      });
    }

    const guestItems = new Map();
    for (const item of incoming) {
      const menuItemId = item.menuItem || item.menuItemId || item._id;
      const quantity = parseQuantity(item.quantity);
      if (!mongoose.isValidObjectId(menuItemId) || !quantity) {
        return res.status(400).json({
          success: false,
          message: "Guest cart contains an invalid menu item or quantity",
        });
      }
      guestItems.set(menuItemId.toString(), quantity);
    }

    if (guestItems.size) {
      const availableItems = await MenuItem.find({
        _id: { $in: [...guestItems.keys()] },
        isAvailable: true,
      }).select("_id");
      if (availableItems.length !== guestItems.size) {
        return res.status(409).json({
          success: false,
          message: "One or more guest cart items are no longer available",
        });
      }
    }

    const cart = await getOrCreateCart(req.user._id);
    const mergedItems = new Map(
      cart.items.map((item) => [item.menuItem.toString(), item.quantity])
    );

    for (const [menuItemId, quantity] of guestItems) {
      mergedItems.set(menuItemId, quantity);
    }

    cart.items = [...mergedItems].map(([menuItem, quantity]) => ({
      menuItem,
      quantity,
    }));
    await cart.save();
    return sendCart(res, cart);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to migrate guest cart",
      error: error.message,
    });
  }
};
