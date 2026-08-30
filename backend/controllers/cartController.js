import mongoose from "mongoose";
import UserCart, { MAX_CART_QUANTITY } from "../models/UserCart.js";
import {
  PRODUCT_TYPES,
  comboHasAvailableItems,
  findAvailableProduct,
  getProductIdentity,
  getProductReference,
  normalizeProductType,
  productKey,
  serializeCombo,
} from "../services/catalogService.js";

const cartPopulation = [
  {
    path: "items.menuItem",
    select:
      "name description price category image tags isAvailable isFeatured calories ingredients",
  },
  {
    path: "items.combo",
    populate: { path: "items.menuItem" },
  },
];

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

const entryIdentity = (entry) => {
  const productType = normalizeProductType(entry.productType);
  return {
    productType,
    productId:
      productType === PRODUCT_TYPES.COMBO
        ? entry.combo?._id || entry.combo
        : entry.menuItem?._id || entry.menuItem,
  };
};

const cartResponseItems = async (cart) => {
  await cart.populate(cartPopulation);
  const availableItems = cart.items.filter((entry) => {
    const { productType } = entryIdentity(entry);
    if (productType === PRODUCT_TYPES.COMBO) {
      return (
        entry.combo &&
        entry.combo.status === "published" &&
        entry.combo.isAvailable &&
        comboHasAvailableItems(entry.combo)
      );
    }
    return entry.menuItem && entry.menuItem.isAvailable;
  });

  if (availableItems.length !== cart.items.length) {
    cart.items = availableItems.map((entry) => {
      const { productType, productId } = entryIdentity(entry);
      return {
        ...getProductReference(productType, productId),
        quantity: entry.quantity,
      };
    });
    await cart.save();
  }

  return availableItems.map((entry) => {
    const { productType } = entryIdentity(entry);
    const product =
      productType === PRODUCT_TYPES.COMBO
        ? serializeCombo(entry.combo)
        : {
            ...entry.menuItem.toObject(),
            productType: PRODUCT_TYPES.MENU_ITEM,
          };
    return { ...product, quantity: entry.quantity };
  });
};

const sendCart = async (res, cart, status = 200) =>
  res.status(status).json({ success: true, data: await cartResponseItems(cart) });

const requestIdentity = (req) =>
  getProductIdentity({
    ...req.body,
    productId: req.params.productId || req.body.productId,
    productType: req.query.productType || req.body.productType,
  });

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
    const { productType, productId } = requestIdentity(req);
    const quantity = parseQuantity(req.body.quantity ?? 1);
    if (!mongoose.isValidObjectId(productId) || !quantity) {
      return res.status(400).json({
        success: false,
        message: `A valid product and quantity from 1 to ${MAX_CART_QUANTITY} are required`,
      });
    }

    if (!(await findAvailableProduct(productType, productId))) {
      return res.status(404).json({
        success: false,
        message: "Product was not found or is unavailable",
      });
    }

    const cart = await getOrCreateCart(req.user._id);
    const requestedKey = productKey(productType, productId);
    const existing = cart.items.find((entry) => {
      const identity = entryIdentity(entry);
      return (
        identity.productId &&
        productKey(identity.productType, identity.productId) === requestedKey
      );
    });

    if (existing) {
      if (existing.quantity + quantity > MAX_CART_QUANTITY) {
        return res.status(400).json({
          success: false,
          message: `Cart quantity cannot exceed ${MAX_CART_QUANTITY}`,
        });
      }
      existing.quantity += quantity;
    } else {
      cart.items.push({
        ...getProductReference(productType, productId),
        quantity,
      });
    }

    await cart.save();
    return sendCart(res, cart, existing ? 200 : 201);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to add product to cart",
      error: error.message,
    });
  }
};

export const updateItem = async (req, res) => {
  try {
    const { productType, productId } = requestIdentity(req);
    const quantity = parseQuantity(req.body.quantity);
    if (!mongoose.isValidObjectId(productId) || !quantity) {
      return res.status(400).json({
        success: false,
        message: `A valid product and quantity from 1 to ${MAX_CART_QUANTITY} are required`,
      });
    }
    if (!(await findAvailableProduct(productType, productId))) {
      return res.status(404).json({
        success: false,
        message: "Product was not found or is unavailable",
      });
    }

    const cart = await getOrCreateCart(req.user._id);
    const requestedKey = productKey(productType, productId);
    const item = cart.items.find((entry) => {
      const identity = entryIdentity(entry);
      return (
        identity.productId &&
        productKey(identity.productType, identity.productId) === requestedKey
      );
    });
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Product is not in your cart",
      });
    }

    item.quantity = quantity;
    await cart.save();
    return sendCart(res, cart);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to update cart product",
      error: error.message,
    });
  }
};

export const removeItem = async (req, res) => {
  try {
    const { productType, productId } = requestIdentity(req);
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product" });
    }

    const cart = await getOrCreateCart(req.user._id);
    const requestedKey = productKey(productType, productId);
    const originalLength = cart.items.length;
    cart.items = cart.items.filter((entry) => {
      const identity = entryIdentity(entry);
      return (
        !identity.productId ||
        productKey(identity.productType, identity.productId) !== requestedKey
      );
    });
    if (cart.items.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: "Product is not in your cart",
      });
    }

    await cart.save();
    return sendCart(res, cart);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to remove cart product",
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
      const { productType, productId } = getProductIdentity(item);
      const quantity = parseQuantity(item.quantity);
      if (!mongoose.isValidObjectId(productId) || !quantity) {
        return res.status(400).json({
          success: false,
          message: "Guest cart contains an invalid product or quantity",
        });
      }
      guestItems.set(productKey(productType, productId), {
        productType,
        productId,
        quantity,
      });
    }

    const availability = await Promise.all(
      [...guestItems.values()].map(({ productType, productId }) =>
        findAvailableProduct(productType, productId)
      )
    );
    if (availability.some((product) => !product)) {
      return res.status(409).json({
        success: false,
        message: "One or more guest cart products are no longer available",
      });
    }

    const cart = await getOrCreateCart(req.user._id);
    const mergedItems = new Map(
      cart.items.map((entry) => {
        const identity = entryIdentity(entry);
        return [
          productKey(identity.productType, identity.productId),
          { ...identity, quantity: entry.quantity },
        ];
      })
    );
    for (const [key, value] of guestItems) mergedItems.set(key, value);

    cart.items = [...mergedItems.values()].map(
      ({ productType, productId, quantity }) => ({
        ...getProductReference(productType, productId),
        quantity,
      })
    );
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
