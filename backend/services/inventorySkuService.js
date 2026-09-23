import Counter from "../models/Counter.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import { ValidationError } from "../utils/inventoryValidation.js";

export const SKU_PREFIX_PATTERN = /^[A-Z0-9]{2,12}$/;
export const INVENTORY_SKU_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,49}$/;

const PREFIX_ALIASES = new Map([
  ["meat", "MEAT"],
  ["bakery", "BAKE"],
  ["baked goods", "BAKE"],
  ["produce", "PROD"],
  ["vegetables", "PROD"],
  ["dairy", "DAIRY"],
  ["beverage", "BEV"],
  ["beverages", "BEV"],
  ["drinks", "BEV"],
  ["sauce", "SAUCE"],
  ["sauces", "SAUCE"],
  ["packaging", "PACK"],
  ["cleaning", "CLEAN"],
]);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const counterKey = (prefix) => `inventory-sku:${prefix}`;

export const normalizeSkuPrefix = (value) => {
  const prefix = String(value || "").trim().toUpperCase();
  if (!SKU_PREFIX_PATTERN.test(prefix)) {
    throw new ValidationError("SKU prefix must contain 2 to 12 uppercase letters or numbers");
  }
  return prefix;
};

export const suggestSkuPrefix = (name) => {
  const normalizedName = String(name || "").trim().toLowerCase();
  const alias = PREFIX_ALIASES.get(normalizedName);
  if (alias) return alias;
  const words = normalizedName.match(/[a-z0-9]+/g) || [];
  if (words.length > 1) {
    const initials = words.map((word) => word[0]).join("").toUpperCase().slice(0, 6);
    if (initials.length >= 2) return initials;
  }
  const compact = words.join("").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (compact.slice(0, 6) || "ITEM").padEnd(2, "X");
};

export const ensureCategorySkuPrefix = async (categoryOrId, { requireActive = false } = {}) => {
  let category = categoryOrId instanceof InventoryCategory
    ? categoryOrId
    : await InventoryCategory.findById(categoryOrId);
  if (!category || (requireActive && !category.isActive)) {
    throw new ValidationError("Category was not found or is inactive");
  }
  if (category.skuPrefix) return category;

  const base = suggestSkuPrefix(category.name);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt ? String(attempt + 1) : "";
    const candidate = `${base.slice(0, 12 - suffix.length)}${suffix}`;
    try {
      const updated = await InventoryCategory.findOneAndUpdate(
        { _id: category._id, $or: [{ skuPrefix: null }, { skuPrefix: "" }, { skuPrefix: { $exists: false } }] },
        { $set: { skuPrefix: candidate } },
        { new: true, runValidators: true }
      );
      if (updated) return updated;
      category = await InventoryCategory.findById(category._id);
      if (category?.skuPrefix) return category;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  throw new ValidationError("Unable to allocate a unique SKU prefix for this category");
};

export const ensureAllCategorySkuPrefixes = async () => {
  const categories = await InventoryCategory.find({ $or: [{ skuPrefix: null }, { skuPrefix: "" }, { skuPrefix: { $exists: false } }] });
  for (const category of categories) await ensureCategorySkuPrefix(category);
};

const existingMaximum = async (prefix) => {
  const pattern = new RegExp(`^INV-${escapeRegex(prefix)}-(\\d+)$`, "i");
  const rows = await InventoryItem.find({ sku: pattern }).select("sku").lean();
  return rows.reduce((maximum, row) => {
    const match = row.sku.match(pattern);
    return Math.max(maximum, Number.parseInt(match?.[1], 10) || 0);
  }, 0);
};

const formatSku = (prefix, sequence) => `INV-${prefix}-${String(sequence).padStart(3, "0")}`;

export const peekNextInventorySku = async (categoryId) => {
  const category = await ensureCategorySkuPrefix(categoryId, { requireActive: true });
  const [counter, maximum] = await Promise.all([
    Counter.findById(counterKey(category.skuPrefix)).lean(),
    existingMaximum(category.skuPrefix),
  ]);
  const sequence = Math.max(Number(counter?.seq || 0), maximum) + 1;
  return { sku: formatSku(category.skuPrefix, sequence), prefix: category.skuPrefix, sequence };
};

export const reserveNextInventorySku = async (categoryId) => {
  const category = await ensureCategorySkuPrefix(categoryId, { requireActive: true });
  const maximum = await existingMaximum(category.skuPrefix);
  const counter = await Counter.findOneAndUpdate(
    { _id: counterKey(category.skuPrefix) },
    [{ $set: { seq: { $add: [{ $max: [{ $ifNull: ["$seq", 0] }, maximum] }, 1] } } }],
    { upsert: true, new: true }
  );
  return { sku: formatSku(category.skuPrefix, counter.seq), prefix: category.skuPrefix, sequence: counter.seq };
};

export const advanceInventorySkuCounter = async (categoryId, sku) => {
  const category = await ensureCategorySkuPrefix(categoryId);
  const match = String(sku || "").toUpperCase().match(new RegExp(`^INV-${escapeRegex(category.skuPrefix)}-(\\d+)$`));
  if (!match) return;
  await Counter.updateOne(
    { _id: counterKey(category.skuPrefix) },
    { $max: { seq: Number.parseInt(match[1], 10) } },
    { upsert: true }
  );
};
