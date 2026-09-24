import mongoose from "mongoose";
import UserCart, { MAX_CART_QUANTITY } from "../models/UserCart.js";
import {
  getProductIdentity,
  getProductReference,
  normalizeProductType,
  productKey,
  resolveCartLines,
} from "../services/catalogService.js";

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
      productType === "combo"
        ? entry.combo?._id || entry.combo
        : entry.menuItem?._id || entry.menuItem,
  };
};

const requestFromEntry = (entry) => {
  const identity = entryIdentity(entry);
  return {
    ...identity,
    quantity: entry.quantity,
    customization: {
      selectedAddOns: entry.selectedAddOns || [],
      spiceLevel: entry.spiceLevel || "",
      note: entry.note || "",
    },
  };
};

const storedLineFromResolved = (line, lineId) => ({
  ...(lineId ? { lineId } : {}),
  ...getProductReference(line.productType, line.productId),
  quantity: line.quantity,
  selectedAddOns: line.customization.selectedAddOns.map((addOn) => ({
    addOn: addOn.addOn,
    quantity: addOn.quantity || 1,
  })),
  spiceLevel: line.customization.spiceLevel,
  note: line.customization.note,
  customizationKey: line.customization.key,
});

const responseLine = (entry, line) => ({
  ...line.product,
  price: line.unitPrice,
  basePrice: line.baseUnitPrice,
  quantity: line.quantity,
  cartLineId: String(entry.lineId),
  selectedAddOns: line.customization.selectedAddOns.map((addOn) => ({
    _id: addOn.addOn,
    name: addOn.name,
    image: addOn.image,
    price: addOn.price,
    quantity: addOn.quantity || 1,
  })),
  spiceLevel: line.customization.spiceLevel,
  note: line.customization.note,
  customizationKey: line.customization.key,
});

const persistedKey = (entry) => {
  const identity = entryIdentity(entry);
  return `${productKey(identity.productType, identity.productId)}:${entry.customizationKey || ""}`;
};

const cartResponseItems = async (cart) => {
  const valid = [];
  let changed = false;
  try {
    const lines = cart.items.length
      ? await resolveCartLines(cart.items.map(requestFromEntry))
      : [];
    cart.items.forEach((entry, index) => {
      const line = lines[index];
      if (entry.customizationKey !== line.customization.key) changed = true;
      entry.customizationKey = line.customization.key;
      valid.push({ entry, line });
    });
  } catch {
    for (const entry of cart.items) {
      try {
        const [line] = await resolveCartLines([requestFromEntry(entry)]);
        if (entry.customizationKey !== line.customization.key) changed = true;
        entry.customizationKey = line.customization.key;
        valid.push({ entry, line });
      } catch {
        try {
          const identity = entryIdentity(entry);
          const [line] = await resolveCartLines([{ ...identity, quantity: entry.quantity }]);
          const replacement = storedLineFromResolved(line, entry.lineId);
          valid.push({ entry: replacement, line });
          changed = true;
        } catch {
          changed = true;
        }
      }
    }
  }
  const consolidated = new Map();
  for (const pair of valid) {
    const key = `${productKey(pair.line.productType, pair.line.productId)}:${pair.line.customization.key}`;
    const existing = consolidated.get(key);
    if (!existing) {
      consolidated.set(key, pair);
      continue;
    }
    const quantity = Math.min(
      MAX_CART_QUANTITY,
      Number(existing.entry.quantity) + Number(pair.entry.quantity)
    );
    existing.entry.quantity = quantity;
    existing.line.quantity = quantity;
    changed = true;
  }
  valid.splice(0, valid.length, ...consolidated.values());
  if (changed) {
    cart.items = valid.map(({ entry }) => entry);
    await cart.save();
  }
  return valid.map(({ entry, line }) => responseLine(entry, line));
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

    const [resolved] = await resolveCartLines([{ ...req.body, productType, productId, quantity }]);
    const cart = await getOrCreateCart(req.user._id);
    const requestedKey = `${productKey(productType, productId)}:${resolved.customization.key}`;
    const existing = cart.items.find((entry) => persistedKey(entry) === requestedKey);

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
        ...storedLineFromResolved(resolved),
      });
    }

    await cart.save();
    return sendCart(res, cart, existing ? 200 : 201);
  } catch (error) {
    return res.status(error.status || 400).json({
      success: false,
      message: error.message || "Failed to add product to cart",
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
    const cart = await getOrCreateCart(req.user._id);
    const lineId = req.query.lineId || req.body.lineId;
    const item = mongoose.isValidObjectId(lineId)
      ? cart.items.find((entry) => String(entry.lineId) === String(lineId))
      : cart.items.find((entry) => {
          const identity = entryIdentity(entry);
          return identity.productId && productKey(identity.productType, identity.productId) === productKey(productType, productId);
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
    const lineId = req.query.lineId || req.body.lineId;
    const requestedKey = productKey(productType, productId);
    const originalLength = cart.items.length;
    cart.items = cart.items.filter((entry) => {
      if (mongoose.isValidObjectId(lineId)) return String(entry.lineId) !== String(lineId);
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

    const resolvedGuestItems = incoming.length ? await resolveCartLines(incoming) : [];
    const guestItems = new Map(
      resolvedGuestItems.map((line) => [
        `${productKey(line.productType, line.productId)}:${line.customization.key}`,
        storedLineFromResolved(line),
      ])
    );
    const cart = await getOrCreateCart(req.user._id);
    const mergedItems = new Map(
      cart.items.map((entry) => {
        return [persistedKey(entry), entry.toObject ? entry.toObject() : entry];
      })
    );
    for (const [key, value] of guestItems) mergedItems.set(key, value);

    cart.items = [...mergedItems.values()];
    await cart.save();
    return sendCart(res, cart);
  } catch (error) {
    return res.status(error.status || 400).json({
      success: false,
      message: error.message || "Failed to migrate guest cart",
      error: error.message,
    });
  }
};
