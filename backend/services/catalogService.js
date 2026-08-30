import mongoose from "mongoose";
import Combo from "../models/Combo.js";
import MenuItem from "../models/MenuItem.js";

export const PRODUCT_TYPES = Object.freeze({
  MENU_ITEM: "menuItem",
  COMBO: "combo",
});

export const normalizeProductType = (value) =>
  value === PRODUCT_TYPES.COMBO
    ? PRODUCT_TYPES.COMBO
    : PRODUCT_TYPES.MENU_ITEM;

export const productKey = (productType, id) =>
  `${normalizeProductType(productType)}:${id.toString()}`;

export const getProductIdentity = (value = {}) => {
  const productType = normalizeProductType(
    value.productType || (value.combo || value.comboId ? "combo" : "menuItem")
  );
  const productId =
    value.productId ||
    (productType === PRODUCT_TYPES.COMBO
      ? value.combo || value.comboId
      : value.menuItem || value.menuItemId) ||
    value._id;

  return { productType, productId };
};

const toPlain = (value) =>
  typeof value?.toObject === "function" ? value.toObject() : value;

export const calculateComboPricing = (items, comboPrice) => {
  const regularPrice = Number(
    items
      .reduce(
        (sum, item) =>
          sum + Number(item.menuItem?.price || 0) * Number(item.quantity || 0),
        0
      )
      .toFixed(2)
  );
  const normalizedComboPrice = Number(Number(comboPrice).toFixed(2));
  const discountAmount = Number(
    Math.max(0, regularPrice - normalizedComboPrice).toFixed(2)
  );
  const discountPercentage = regularPrice
    ? Number(((discountAmount / regularPrice) * 100).toFixed(1))
    : 0;

  return {
    regularPrice,
    comboPrice: normalizedComboPrice,
    discountAmount,
    discountPercentage,
  };
};

export const serializeCombo = (combo) => {
  const plain = toPlain(combo);
  const includedItems = (plain.items || [])
    .filter((entry) => entry.menuItem)
    .map((entry) => ({
      menuItem: toPlain(entry.menuItem),
      quantity: entry.quantity,
    }));
  const pricing = calculateComboPricing(includedItems, plain.comboPrice);

  return {
    ...plain,
    ...pricing,
    items: includedItems,
    includedItems,
    price: pricing.comboPrice,
    productType: PRODUCT_TYPES.COMBO,
  };
};

export const comboHasAvailableItems = (combo) =>
  Array.isArray(combo.items) &&
  combo.items.length > 0 &&
  combo.items.every(
    (entry) => entry.menuItem && entry.menuItem.isAvailable !== false
  );

export const findAvailableProduct = async (productType, productId) => {
  if (!mongoose.isValidObjectId(productId)) return null;

  if (normalizeProductType(productType) === PRODUCT_TYPES.COMBO) {
    const combo = await Combo.findOne({
      _id: productId,
      status: "published",
      isAvailable: true,
    }).populate("items.menuItem");
    if (!combo || !comboHasAvailableItems(combo)) return null;
    return serializeCombo(combo);
  }

  const item = await MenuItem.findOne({
    _id: productId,
    isAvailable: true,
  }).lean();
  return item
    ? { ...item, productType: PRODUCT_TYPES.MENU_ITEM }
    : null;
};

export const getProductReference = (productType, productId) =>
  normalizeProductType(productType) === PRODUCT_TYPES.COMBO
    ? { productType: PRODUCT_TYPES.COMBO, combo: productId, menuItem: null }
    : { productType: PRODUCT_TYPES.MENU_ITEM, menuItem: productId, combo: null };
