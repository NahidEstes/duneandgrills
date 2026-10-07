import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryBatch from "../models/InventoryBatch.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventorySettings from "../models/InventorySettings.js";
import Supplier from "../models/Supplier.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchasingAction from "../models/PurchasingAction.js";
import StockTransaction from "../models/StockTransaction.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import adminRoutes from "../routes/adminRoutes.js";
import inventoryRoutes from "../routes/inventoryRoutes.js";
import { getInventoryHealth } from "../services/inventoryHealthService.js";
import { expiryDayStart, getSaleableInventory } from "../services/inventoryEligibilityService.js";

// No dotenv or external URI. The helper starts and owns an ephemeral loopback replica set.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "isolated-admin-inventory-health-secret";

test("Admin Inventory Health and matching destinations (owned isolated DB)", { timeout: 180000 }, async t => {
  await withIsolatedMongo(async () => {
    assert.equal(mongoose.connection.db.databaseName, "dg_record_id_test");
    const users = {};
    for (const role of ["admin", "manager", "cashier", "inventory"]) users[role] = await User.create({ name: `Health ${role}`, email: `health-${role}@test.local`, password: "TestPassword123!", role });
    const category = await InventoryCategory.create({ name: "Health fixtures", skuPrefix: "HLTH" });
    const supplier = await Supplier.create({ code: "HEALTH-SUPPLIER", name: "Health fixture supplier" });
    await InventorySettings.create({ expiryAlertDays: 3 });
    const today = expiryDayStart();
    const date = days => new Date(today.getTime() + days * 86400000);
    let seq = 0;
    const item = options => InventoryItem.create({ name: `Health item ${++seq}`, sku: `HLTH-${seq}`, category: category._id, supplier: supplier._id, unit: "kg", currentStock: 10, reorderLevel: 3, tracksExpiry: true, ...options });
    const batch = (row, quantity, expiryDate, qualityStatus = "usable") => InventoryBatch.create({ item: row._id, lotNumber: `HLTH-LOT-${++seq}`, receivedQuantity: quantity || 1, remainingQuantity: quantity, unitCost: 10, expiryDate, qualityStatus, source: "STOCK_IN" });
    const blocked = await item({ name: "All blocked physical stock" });
    await batch(blocked, 3, date(-1)); await batch(blocked, 2, date(-2)); await batch(blocked, 2, date(1), "quarantined"); await batch(blocked, 3, date(2), "damaged");
    const mixed = await item({ name: "Mixed low saleable stock" });
    await batch(mixed, 3, date(0)); await batch(mixed, 7, date(-1));
    const missing = await item({ name: "Unknown tracked expiry" }); await batch(missing, 10, null);
    const depleted = await item({ name: "Depleted history with physical gap", expiryDate: date(1) }); await batch(depleted, 0, date(-1));
    const legacy = await item({ name: "Genuine legacy untracked", tracksExpiry: false });
    const legacyDated = await item({ name: "Genuine dated legacy", expiryDate: date(3) });
    const outside = await item({ name: "Outside configured expiry window" }); await batch(outside, 10, date(4));
    const inactive = await item({ name: "Archived fixture", isActive: false }); await batch(inactive, 10, date(-1));
    const empty = await item({ name: "Empty fixture", currentStock: 0 });
    for (const status of ["draft", "ordered", "partially_received", "received", "closed_short"]) await PurchaseOrder.create({ orderNumber: `HEALTH-PO-${status.toUpperCase().replaceAll("_", "-")}`, supplier: supplier._id, items: [{ item: legacy._id, itemName: legacy.name, sku: legacy.sku, quantity: 10, unitCost: 10, receivedQuantity: status === "received" ? 10 : status === "partially_received" ? 4 : 0 }], status, subtotal: 100, total: 100, createdBy: users.admin._id, updatedBy: users.admin._id });
    for (const state of ["open", "acknowledged", "snoozed", "resolved"]) await PurchasingAction.create({ fingerprint: `health-${state}`, state, actionType: "LOW_STOCK", severity: "high", title: `Health ${state}`, explanation: "Isolated health fixture", entityType: "InventoryItem", entityId: legacy._id, href: "/inventory/stock-items" });
    const originalItems = await InventoryItem.find().sort({ _id: 1 }).lean();
    const originalBatches = await InventoryBatch.find().sort({ _id: 1 }).lean();
    const originalAudits = await AuditLog.countDocuments(), originalMovements = await StockTransaction.countDocuments();
    const app = express(); app.use("/api/admin", adminRoutes); app.use("/api/inventory", inventoryRoutes);
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
    const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = (path, role = "admin") => fetch(`${base}${path}`, { headers: role ? { Authorization: `Bearer ${jwt.sign({ id: String(users[role]._id) }, process.env.JWT_SECRET)}` } : {} });
    const read = async path => { const res = await call(path); const body = await res.json(); assert.equal(res.status, 200, body.message); return body; };
    try {
      const dashboard = await read("/api/admin/dashboard"), summary = dashboard.data.inventorySummary;
      await t.test("dashboard uses saleable quantities and unique active-item warnings", () => {
        assert.equal(summary.lowStock, 1); assert.equal(summary.outOfStock, 4);
        assert.equal(summary.blockedItems, 4); assert.equal(summary.expiredItems, 2);
        assert.equal(summary.quarantinedItems, 1); assert.equal(summary.damagedItems, 1);
        assert.equal(summary.unknownExpiryItems, 1); assert.equal(summary.unallocatedItems, 1);
        assert.equal(summary.expiringItems, 3); assert.equal(summary.expiryAlertDays, 3);
        assert.equal(summary.pendingPurchaseOrders, 2); assert.equal(summary.openPurchasingActions, 2);
      });
      await t.test("every card/warning destination returns exactly its unique-item/order/action count", async () => {
        for (const [metric, href] of Object.entries(summary.destinations)) {
          const destination = href.replace("/inventory/stock-items", "/api/inventory/items").replace(/^\/inventory\//, "/api/inventory/");
          const result = await read(`${destination}&limit=100`);
          assert.equal(result.pagination.total, summary[metric], metric);
          assert.equal(new Set(result.data.map(row => row._id)).size, summary[metric], metric);
          if (href.includes("stock-items")) assert.ok(result.data.every(row => row.isActive));
        }
      });
      await t.test("filtered pagination/search/category/supplier and physical versus saleable detail agree", async () => {
        const page = await read("/api/inventory/items?status=out&limit=1&page=2"); assert.equal(page.data.length, 1); assert.equal(page.pagination.total, 4);
        const low = await read(`/api/inventory/items?status=low&category=${category._id}&supplier=${supplier._id}&search=Mixed`);
        assert.equal(low.pagination.total, 1); assert.equal(low.data[0].physicalStock, 10); assert.equal(low.data[0].saleableStock, 3);
        const details = await read(`/api/inventory/items/${blocked._id}`); assert.equal(details.data.currentStock, 10); assert.equal(details.data.saleableStock, 0);
        assert.deepEqual(details.data.blockedReasons.sort(), ["damaged", "expired", "quarantined"]);
        assert.equal((await read("/api/inventory/items?status=expired&search=not-present")).pagination.total, 0);
        assert.equal((await read("/api/inventory/items?status=inactive")).data[0]._id, String(inactive._id));
      });
      await t.test("batched calculation equals existing shared saleable service, including legacy/depleted history", async () => {
        const health = await getInventoryHealth();
        for (const row of health.rows) assert.equal(row.saleableStock, (await getSaleableInventory(row)).saleableStock, row.name);
        assert.equal(health.rows.find(row => String(row._id) === String(legacy._id)).saleableStock, 10);
        assert.equal(health.rows.find(row => String(row._id) === String(legacyDated._id)).legacyStockFallback, true);
        assert.equal(health.rows.find(row => String(row._id) === String(empty._id)).stockHealth.blocked, false);
      });
      await t.test("historical missing quality and unclassified null quality match the sales eligibility query", async () => {
        const id = new mongoose.Types.ObjectId();
        // Fixtures are temporary and removed by the owning helper, never production records.
        await InventoryItem.create({ _id: id, name: "Historical quality fixture", sku: "HLTH-QUALITY", category: category._id, unit: "kg", currentStock: 10, tracksExpiry: true });
        const legacyQuality = await batch({ _id: id }, 5, date(4));
        await InventoryBatch.collection.updateOne({ _id: legacyQuality._id }, { $unset: { qualityStatus: "" } });
        await batch({ _id: id }, 5, date(4), null);
        try {
          const row = (await getInventoryHealth({ items: [await InventoryItem.findById(id).lean()] })).rows[0];
          assert.equal(row.saleableStock, 5); assert.equal(row.stockHealth.unknown_quality, true);
          assert.equal(row.saleableStock, (await getSaleableInventory(row)).saleableStock);
        } finally { await InventoryBatch.deleteMany({ item: id }); await InventoryItem.deleteOne({ _id: id }); }
      });
      await t.test("health calculation uses three batched DB requests, not one request per item", async () => {
        const calls = []; mongoose.set("debug", (collection, method) => calls.push([collection, method]));
        try { await getInventoryHealth(); } finally { mongoose.set("debug", false); }
        assert.deepEqual(calls.map(row => row[1]).sort(), ["find", "find", "findOne"]);
      });
      await t.test("existing permissions retained for dashboard and all filtered destinations", async () => {
        assert.equal((await call("/api/admin/dashboard", null)).status, 401);
        assert.equal((await call("/api/admin/dashboard", "cashier")).status, 403);
        assert.equal((await call("/api/admin/dashboard", "inventory")).status, 403);
        assert.equal((await call("/api/admin/dashboard", "manager")).status, 200);
        for (const href of Object.values(summary.destinations)) {
          const path = href.replace("/inventory/stock-items", "/api/inventory/items").replace(/^\/inventory\//, "/api/inventory/");
          assert.equal((await call(path, "manager")).status, 200); assert.equal((await call(path, "cashier")).status, 403);
        }
        assert.equal((await call("/api/inventory/items?status=blocked", "inventory")).status, 200);
      });
      await t.test("read-only health never rewrites stock, batch dates/status, IDs, movements or audit history", async () => {
        assert.deepEqual(await InventoryItem.find().sort({ _id: 1 }).lean(), originalItems);
        assert.deepEqual(await InventoryBatch.find().sort({ _id: 1 }).lean(), originalBatches);
        assert.equal(await AuditLog.countDocuments(), originalAudits); assert.equal(await StockTransaction.countDocuments(), originalMovements);
      });
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
