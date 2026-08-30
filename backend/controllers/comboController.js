import mongoose from "mongoose";
import Combo from "../models/Combo.js";
import MenuItem from "../models/MenuItem.js";
import User from "../models/User.js";
import UserCart from "../models/UserCart.js";
import {
  calculateComboPricing,
  comboHasAvailableItems,
  serializeCombo,
} from "../services/catalogService.js";

const slugify = (value = "") =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "combo";

const createUniqueSlug = async (name, excludeId) => {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (
    await Combo.exists({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
  ) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
};

const parseItems = (items) => {
  if (!Array.isArray(items) || !items.length || items.length > 10) {
    throw new Error("A combo must contain between 1 and 10 menu items");
  }

  const normalized = items.map((entry) => ({
    menuItem: entry.menuItem || entry.menuItemId || entry._id,
    quantity: Number(entry.quantity),
  }));
  if (
    normalized.some(
      (entry) =>
        !mongoose.isValidObjectId(entry.menuItem) ||
        !Number.isInteger(entry.quantity) ||
        entry.quantity < 1 ||
        entry.quantity > 99
    )
  ) {
    throw new Error("Every combo item needs a valid menu item and quantity");
  }
  const ids = normalized.map((entry) => entry.menuItem.toString());
  if (ids.length !== new Set(ids).size) {
    throw new Error("A combo cannot contain duplicate menu items");
  }
  return normalized;
};

const buildComboValues = async (body, existing) => {
  const name = String(body.name ?? existing?.name ?? "").trim();
  const description = String(
    body.description ?? existing?.description ?? ""
  ).trim();
  const image = String(body.image ?? existing?.image ?? "").trim();
  const items = parseItems(body.items ?? existing?.items ?? []);
  const comboPrice = Number(body.comboPrice ?? existing?.comboPrice);
  const status = body.status ?? existing?.status ?? "draft";
  const isAvailable = body.isAvailable ?? existing?.isAvailable ?? true;

  if (!name || !description || !image) {
    throw new Error("Combo name, description and image are required");
  }
  if (!Number.isFinite(comboPrice) || comboPrice <= 0) {
    throw new Error("Combo price must be greater than zero");
  }
  if (!["draft", "published"].includes(status)) {
    throw new Error("Combo status must be draft or published");
  }

  const menuItems = await MenuItem.find({
    _id: { $in: items.map((entry) => entry.menuItem) },
  }).lean();
  if (menuItems.length !== items.length) {
    throw new Error("One or more selected menu items do not exist");
  }
  if (
    status === "published" &&
    isAvailable &&
    menuItems.some((item) => !item.isAvailable)
  ) {
    throw new Error("A published combo cannot contain unavailable menu items");
  }

  const itemMap = new Map(
    menuItems.map((item) => [item._id.toString(), item])
  );
  const populatedItems = items.map((entry) => ({
    ...entry,
    menuItem: itemMap.get(entry.menuItem.toString()),
  }));
  const pricing = calculateComboPricing(populatedItems, comboPrice);
  const featuredOrder = Number(
    body.featuredOrder ?? existing?.featuredOrder ?? 0
  );
  if (!Number.isInteger(featuredOrder) || featuredOrder < 0) {
    throw new Error("Featured position must be a non-negative whole number");
  }

  return {
    name,
    slug: await createUniqueSlug(name, existing?._id),
    description,
    image,
    category: "Combos",
    items,
    ...pricing,
    isAvailable,
    isFeatured: body.isFeatured ?? existing?.isFeatured ?? false,
    featuredOrder,
    status,
  };
};

const populateCombo = (query) => query.populate("items.menuItem");

export const getCombos = async (req, res) => {
  try {
    const combos = await populateCombo(
      Combo.find({ status: "published", isAvailable: true }).sort({
        isFeatured: -1,
        featuredOrder: 1,
        createdAt: -1,
      })
    );
    const data = combos
      .filter(comboHasAvailableItems)
      .map((combo) => serializeCombo(combo));
    return res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load combos",
      error: error.message,
    });
  }
};

export const getManagedCombos = async (req, res) => {
  try {
    const combos = await populateCombo(
      Combo.find().sort({ updatedAt: -1 })
    );
    return res.status(200).json({
      success: true,
      count: combos.length,
      data: combos.map((combo) => serializeCombo(combo)),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load combo management",
      error: error.message,
    });
  }
};

export const getCombo = async (req, res) => {
  try {
    const filter = mongoose.isValidObjectId(req.params.idOrSlug)
      ? { _id: req.params.idOrSlug }
      : { slug: req.params.idOrSlug };
    const combo = await populateCombo(
      Combo.findOne({ ...filter, status: "published", isAvailable: true })
    );
    if (!combo || !comboHasAvailableItems(combo)) {
      return res.status(404).json({ success: false, message: "Combo not found" });
    }
    return res.status(200).json({ success: true, data: serializeCombo(combo) });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load combo",
      error: error.message,
    });
  }
};

export const createCombo = async (req, res) => {
  try {
    const combo = await Combo.create(await buildComboValues(req.body));
    await combo.populate("items.menuItem");
    return res.status(201).json({ success: true, data: serializeCombo(combo) });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to create combo",
      error: error.message,
    });
  }
};

export const updateCombo = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid combo" });
    }
    const combo = await Combo.findById(req.params.id);
    if (!combo) {
      return res.status(404).json({ success: false, message: "Combo not found" });
    }
    combo.set(await buildComboValues(req.body, combo));
    await combo.save();
    await combo.populate("items.menuItem");
    return res.status(200).json({ success: true, data: serializeCombo(combo) });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to update combo",
      error: error.message,
    });
  }
};

export const deleteCombo = async (req, res) => {
  try {
    const combo = mongoose.isValidObjectId(req.params.id)
      ? await Combo.findByIdAndDelete(req.params.id)
      : null;
    if (!combo) {
      return res.status(404).json({ success: false, message: "Combo not found" });
    }
    await Promise.all([
      User.updateMany({}, { $pull: { favoriteCombos: combo._id } }),
      UserCart.updateMany(
        { "items.combo": combo._id },
        { $pull: { items: { productType: "combo", combo: combo._id } } }
      ),
    ]);
    return res.status(200).json({ success: true, message: "Combo deleted" });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete combo",
      error: error.message,
    });
  }
};
