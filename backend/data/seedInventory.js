import "dotenv/config";
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import StockTransaction from "../models/StockTransaction.js";
import Supplier from "../models/Supplier.js";
import User from "../models/User.js";
import {
  createOpeningBalance,
  runInventoryTransaction,
} from "../services/inventoryStockService.js";

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/duneandgrills";

const loadSeedData = async () => {
  const file = new URL("./inventoryDemoSeed.json", import.meta.url);
  return JSON.parse(await readFile(file, "utf8"));
};

const seedCategories = async (categories) => {
  const categoryMap = new Map();

  for (const category of categories) {
    const row = await InventoryCategory.findOneAndUpdate(
      {
        $or: [
          { externalId: `demo-category:${category.code}` },
          { name: category.name },
        ],
      },
      {
        $set: {
          name: category.name,
          description: category.description,
          color: category.color,
          isActive: category.isActive !== false,
        },
        $setOnInsert: { externalId: `demo-category:${category.code}` },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
        collation: { locale: "en", strength: 2 },
      }
    );
    categoryMap.set(category.code, row);
  }

  return categoryMap;
};

const seedSuppliers = async (suppliers) => {
  const supplierMap = new Map();

  for (const supplier of suppliers) {
    const row = await Supplier.findOneAndUpdate(
      { code: supplier.code },
      {
        $set: {
          name: supplier.name,
          contactName: supplier.contactName,
          email: supplier.email,
          phone: supplier.phone,
          paymentTerms: supplier.paymentTerms,
          isActive: supplier.isActive !== false,
          externalId: `demo-supplier:${supplier.code}`,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    supplierMap.set(supplier.code, row);
  }

  return supplierMap;
};

const seedItems = async (items, categoryMap, supplierMap, userId) => {
  let created = 0;
  let updated = 0;
  let openingBalances = 0;

  for (const source of items) {
    const category = categoryMap.get(source.categoryCode);
    const supplier = supplierMap.get(source.supplierCode);
    if (!category) throw new Error(`Unknown categoryCode: ${source.categoryCode}`);
    if (!supplier) throw new Error(`Unknown supplierCode: ${source.supplierCode}`);

    const itemPayload = {
      name: source.name,
      sku: source.sku,
      category: category._id,
      unit: source.unit,
      reorderLevel: source.reorderLevel,
      unitCost: source.unitCost,
      supplier: supplier._id,
      tracksExpiry: Boolean(source.tracksExpiry),
      expiryDate: source.expiryDate ? new Date(source.expiryDate) : null,
      storageLocation: source.storageLocation,
      isActive: source.isActive !== false,
      allowNegativeStock: Boolean(source.allowNegativeStock),
      externalId: `demo-item:${source.sku}`,
    };

    let item = await InventoryItem.findOne({ sku: source.sku });
    if (!item) {
      item = await runInventoryTransaction(async (session) => {
        const [newItem] = await InventoryItem.create(
          [{ ...itemPayload, currentStock: 0 }],
          session ? { session } : {}
        );
        if (Number(source.openingStock) > 0) {
          await createOpeningBalance(
            newItem,
            Number(source.openingStock),
            userId,
            session
          );
        }
        return newItem;
      });
      created += 1;
      if (Number(source.openingStock) > 0) openingBalances += 1;
      continue;
    }

    Object.assign(item, itemPayload);
    await item.save();
    updated += 1;

    const hasHistory = await StockTransaction.exists({ item: item._id });
    if (!hasHistory && item.currentStock === 0 && Number(source.openingStock) > 0) {
      await runInventoryTransaction((session) =>
        createOpeningBalance(item, Number(source.openingStock), userId, session)
      );
      openingBalances += 1;
    }
  }

  return { created, updated, openingBalances };
};

const seedInventory = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    const data = await loadSeedData();
    const actor = await User.findOne({ role: { $in: ["admin", "manager"] } })
      .sort({ role: 1, createdAt: 1 })
      .select("_id name role");

    if (!actor) {
      throw new Error(
        "Inventory seeding requires an existing admin or manager account so opening balances have an audit user."
      );
    }

    const categoryMap = await seedCategories(data.categories);
    const supplierMap = await seedSuppliers(data.suppliers);
    const result = await seedItems(
      data.items,
      categoryMap,
      supplierMap,
      actor._id
    );

    console.log("Inventory demo data seeded successfully.");
    console.log(`Categories: ${categoryMap.size}`);
    console.log(`Suppliers: ${supplierMap.size}`);
    console.log(`Items created: ${result.created}`);
    console.log(`Items updated: ${result.updated}`);
    console.log(`Opening balances recorded: ${result.openingBalances}`);
    console.log(`Audit user: ${actor.name} (${actor.role})`);
  } finally {
    await mongoose.disconnect();
  }
};

seedInventory().catch((error) => {
  console.error("Failed to seed inventory:", error.message);
  process.exitCode = 1;
});
