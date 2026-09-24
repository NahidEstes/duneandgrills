import mongoose from "mongoose";
import {
  MAX_ADD_ONS_PER_ITEM,
  MAX_ITEM_NOTE_LENGTH,
  SPICE_LEVELS,
} from "../config/menuCustomization.js";
import MenuAddOn from "../models/MenuAddOn.js";
import MenuItem from "../models/MenuItem.js";

export class MenuCustomizationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "MenuCustomizationError";
    this.status = status;
  }
}

const cleanText = (value, maximum) =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

const objectIdString = (value) => String(value?._id || value?.addOn || value?.id || value || "");

export const normalizeCustomizationSettings = (value = {}) => {
  const spice = value?.spice || {};
  const options = [...new Set(Array.isArray(spice.options) ? spice.options : [])];
  if (options.some((option) => !SPICE_LEVELS.includes(option))) {
    throw new MenuCustomizationError("One or more spice options are invalid");
  }
  const spiceEnabled = Boolean(spice.enabled);
  if (spiceEnabled && !options.length) {
    throw new MenuCustomizationError("Choose at least one available spice level");
  }
  const defaultSpice = cleanText(spice.default, 30);
  if (defaultSpice && !options.includes(defaultSpice)) {
    throw new MenuCustomizationError(
      "Default spice level must be one of the available options"
    );
  }
  return {
    enabled: Boolean(value.enabled),
    spice: {
      enabled: spiceEnabled,
      options,
      default: defaultSpice,
    },
  };
};

export const validateMenuAddOnPayload = async (payload = {}) => {
  const name = cleanText(payload.name, 80);
  if (!name) throw new MenuCustomizationError("Add-on name is required");
  const price = Number(payload.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new MenuCustomizationError("Add-on price must be zero or greater");
  }
  const menuItemIds = [...new Set(Array.isArray(payload.menuItems) ? payload.menuItems.map(String) : [])];
  if (menuItemIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw new MenuCustomizationError("One or more selected menu items are invalid");
  }
  if (menuItemIds.length) {
    const count = await MenuItem.countDocuments({ _id: { $in: menuItemIds } });
    if (count !== menuItemIds.length) {
      throw new MenuCustomizationError("One or more selected menu items were not found");
    }
  }
  return {
    name,
    price: Number(price.toFixed(2)),
    image: cleanText(payload.image, 500),
    isActive: payload.isActive !== false,
    menuItems: menuItemIds,
  };
};

export const attachPublicCustomizations = async (items) => {
  const plainItems = items.map((item) =>
    typeof item?.toObject === "function" ? item.toObject() : item
  );
  const enabledIds = plainItems
    .filter((item) => item.customization?.enabled)
    .map((item) => item._id);
  if (!enabledIds.length) {
    return plainItems.map((item) => ({ ...item, addOns: [] }));
  }
  const addOns = await MenuAddOn.find({
    isActive: true,
    menuItems: { $in: enabledIds },
  })
    .select("name price image menuItems")
    .sort({ name: 1 })
    .lean();
  return plainItems.map((item) => ({
    ...item,
    addOns: item.customization?.enabled
      ? addOns
          .filter((addOn) => addOn.menuItems.some((id) => String(id) === String(item._id)))
          .map(({ _id, name, price, image }) => ({ _id, name, price, image }))
      : [],
  }));
};

export const customizationRequestFrom = (item = {}) => {
  const source = item.customization && typeof item.customization === "object"
    ? item.customization
    : item;
  const selectedAddOns = Array.isArray(source.selectedAddOns)
    ? source.selectedAddOns.map((entry) => ({ id: objectIdString(entry), quantity: Number(entry?.quantity || 1) })).filter((entry) => entry.id)
    : [];
  return {
    requested:
      selectedAddOns.length > 0 ||
      Boolean(source.spiceLevel) ||
      Boolean(source.note),
    selectedAddOns,
    spiceLevel: cleanText(source.spiceLevel, 30),
    note: cleanText(source.note, MAX_ITEM_NOTE_LENGTH),
  };
};

export const collectCustomizationAddOnIds = (requests) => [
  ...new Set(requests.flatMap((request) => request.selectedAddOns.map((entry) => entry.id))),
];

export const loadCustomizationAddOnMap = async (ids) => {
  if (!ids.length) return new Map();
  if (ids.some((id) => !mongoose.isValidObjectId(id))) {
    throw new MenuCustomizationError("One or more selected add-ons are invalid");
  }
  const rows = await MenuAddOn.find({ _id: { $in: ids } }).lean();
  return new Map(rows.map((row) => [String(row._id), row]));
};

export const resolveLineCustomization = ({
  product,
  productType,
  request,
  addOnMap,
}) => {
  if (!request.requested) {
    return {
      selectedAddOns: [],
      spiceLevel: "",
      note: "",
      addOnTotal: 0,
      key: "",
    };
  }
  if (productType !== "menuItem" || !product.customization?.enabled) {
    throw new MenuCustomizationError("Customization is not available for this item", 409);
  }
  if (request.selectedAddOns.length > MAX_ADD_ONS_PER_ITEM) {
    throw new MenuCustomizationError(`Choose no more than ${MAX_ADD_ONS_PER_ITEM} add-ons`);
  }
  if (request.selectedAddOns.some((entry) => !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 99)) {
    throw new MenuCustomizationError("Add-on quantity must be between 1 and 99");
  }
  const uniqueIds = [...new Set(request.selectedAddOns.map((entry) => entry.id))];
  if (uniqueIds.length !== request.selectedAddOns.length) {
    throw new MenuCustomizationError("The same add-on cannot be selected more than once");
  }
  const selectedAddOns = uniqueIds.map((id) => {
    const addOn = addOnMap.get(id);
    const applies = addOn?.menuItems?.some(
      (menuItemId) => String(menuItemId) === String(product._id)
    );
    if (!addOn || !addOn.isActive || !applies) {
      throw new MenuCustomizationError(
        "One or more selected add-ons are no longer available",
        409
      );
    }
    return {
      addOn: addOn._id,
      name: addOn.name,
      image: addOn.image || "",
      price: Number(addOn.price),
      quantity: request.selectedAddOns.find((entry) => entry.id === id)?.quantity || 1,
    };
  });

  const spice = product.customization?.spice || {};
  let spiceLevel = "";
  if (spice.enabled) {
    spiceLevel = request.spiceLevel || spice.default || spice.options?.[0] || "";
    if (!spice.options?.includes(spiceLevel)) {
      throw new MenuCustomizationError("The selected spice level is not available", 409);
    }
  } else if (request.spiceLevel) {
    throw new MenuCustomizationError("Spice level is not available for this item", 409);
  }

  const key = selectedAddOns.length || spiceLevel || request.note
    ? JSON.stringify({
        addOns: selectedAddOns.map((entry) => ({ id: String(entry.addOn), quantity: entry.quantity })).sort((a, b) => a.id.localeCompare(b.id)),
        spiceLevel,
        note: request.note,
      })
    : "";
  return {
    selectedAddOns,
    spiceLevel,
    note: request.note,
    addOnTotal: Number(
      selectedAddOns.reduce((sum, addOn) => sum + addOn.price * addOn.quantity, 0).toFixed(2)
    ),
    key,
  };
};
