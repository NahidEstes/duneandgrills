import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Counter from "../models/Counter.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import { updateItem } from "../controllers/inventory/itemController.js";
import { advanceInventorySkuCounter, ensureCategorySkuPrefix, peekNextInventorySku, reserveNextInventorySku } from "../services/inventorySkuService.js";

const testUri = process.env.MONGO_TEST_URI || "mongodb://127.0.0.1:27017/duneandgrills_sku_test";

const run = async () => {
  await mongoose.connect(testUri);
  const databaseName = mongoose.connection.db.databaseName;
  if (!databaseName.endsWith("_test")) throw new Error(`Refusing to run destructive checks against ${databaseName}`);
  await mongoose.connection.dropDatabase();
  await Promise.all([InventoryCategory.syncIndexes(), InventoryItem.syncIndexes(), Counter.syncIndexes()]);

  const meat = await ensureCategorySkuPrefix(await InventoryCategory.create({ name: "Meat" }));
  const bakery = await ensureCategorySkuPrefix(await InventoryCategory.create({ name: "Bakery" }));
  assert.equal(meat.skuPrefix, "MEAT");
  assert.equal(bakery.skuPrefix, "BAKE");
  assert.equal((await peekNextInventorySku(meat._id)).sku, "INV-MEAT-001");

  const reservations = await Promise.all(Array.from({ length: 12 }, () => reserveNextInventorySku(meat._id)));
  assert.equal(new Set(reservations.map((row) => row.sku)).size, 12);
  assert.deepEqual(reservations.map((row) => row.sequence).sort((a, b) => a - b), Array.from({ length: 12 }, (_, index) => index + 1));
  assert.equal((await reserveNextInventorySku(bakery._id)).sku, "INV-BAKE-001");

  await InventoryItem.create({ name: "Archived historical item", sku: "INV-MEAT-020", category: meat._id, unit: "kg", isActive: false });
  await Counter.deleteOne({ _id: "inventory-sku:MEAT" });
  assert.equal((await reserveNextInventorySku(meat._id)).sku, "INV-MEAT-021", "archived sequence must not be reused and existing max must bootstrap the counter");

  await advanceInventorySkuCounter(meat._id, "INV-MEAT-050");
  assert.equal((await reserveNextInventorySku(meat._id)).sku, "INV-MEAT-051", "manual standard SKU must advance the automatic counter");

  await InventoryCategory.updateOne({ _id: meat._id }, { name: "Premium Proteins" });
  assert.equal((await ensureCategorySkuPrefix(meat._id)).skuPrefix, "MEAT", "category rename must not change prefix");
  await assert.rejects(InventoryItem.create({ name: "Conflict", sku: "INV-MEAT-020", category: meat._id, unit: "kg" }), (error) => error?.code === 11000);

  const item = await InventoryItem.findOne({ sku: "INV-MEAT-020" });
  let controllerError;
  await updateItem({ params: { id: item._id }, body: { sku: "INV-MEAT-999" } }, { json() {} }, (error) => { controllerError = error; });
  assert.match(controllerError?.message || "", /cannot be changed/);
  assert.equal((await InventoryItem.findById(item._id)).sku, "INV-MEAT-020");
  console.log("Inventory SKU integration checks passed");
};

try { await run(); } finally { if (mongoose.connection.readyState === 1) { if (mongoose.connection.db.databaseName.endsWith("_test")) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); } }
