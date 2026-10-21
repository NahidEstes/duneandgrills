import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import adminRoutes from "../routes/adminRoutes.js";
import inventoryRoutes from "../routes/inventoryRoutes.js";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import Counter from "../models/Counter.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "owned-admin-inventory-fixes-test-secret";

test("Admin access and Inventory regressions use an owned disposable database", { timeout: 180000 }, async t => {
  await withIsolatedMongo(async () => {
    let sequence = 0;
    const account = (role = "admin", extra = {}) => User.create({ name: `Owned ${++sequence}`, email: `owned-fixes-${sequence}@example.test`, password: "OwnedTestPassword123!", role, ...extra });
    const token = user => jwt.sign({ id: String(user._id), sv: Number(user.sessionVersion || 0) }, process.env.JWT_SECRET);
    const app = express(); app.use(express.json()); app.use("/api/admin", adminRoutes); app.use("/api/inventory", inventoryRoutes);
    app.use((error, req, res, next) => res.status(error.status || 500).json({ success: false, message: error.message }));
    const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const request = async (user, path, method = "GET", body) => {
      const response = await fetch(origin + path, { method, headers: { Authorization: `Bearer ${token(user)}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    const patch = (actor, user, body) => request(actor, `/api/admin/staff/${user._id}`, "PATCH", body);
    const resetAdmins = () => User.updateMany({ role: "admin" }, { $set: { role: "manager" } });
    const category = await InventoryCategory.create({ name: "Owned audit stock", skuPrefix: "OAS" });
    await InventoryItem.collection.insertMany(Array.from({ length: 137 }, (_, index) => ({ _id: new mongoose.Types.ObjectId(), name: "Same report name", sku: `OAS-${index}`, category: category._id, unit: "pcs", currentStock: 0, unitCost: 2, reorderLevel: 5, isActive: true, stockVersion: 0 })));
    // Sentinel documents ensure staff/access/report reads cannot silently alter financial records.
    const watched = ["inventoryitems", "inventorybatches", "stocktransactions", "orders", "supplierinvoices", "supplierpayments", "expenses", "cashmovements", "posshifts"];
    for (const name of watched.filter(name => name !== "inventoryitems")) await mongoose.connection.db.collection(name).insertOne({ _id: new mongoose.Types.ObjectId(), auditFixture: true, amount: 123.45 });
    const snapshot = async () => Object.fromEntries(await Promise.all(watched.map(async name => [name, JSON.stringify(await mongoose.connection.db.collection(name).find().sort({ _id: 1 }).toArray())])));
    const before = await snapshot();
    try {
      await t.test("sole active admin cannot be demoted; inactive admins do not count", async () => {
        const admin = await account(); await account("admin", { isActive: false });
        const auditCount = await AuditLog.countDocuments();
        const response = await patch(admin, admin, { role: "manager", name: "Must not be saved" });
        assert.equal(response.status, 409); assert.match(response.body.message, /last active admin/);
        const unchanged = await User.findById(admin._id).select("+sessionVersion");
        assert.equal(unchanged.role, "admin"); assert.equal(unchanged.name, admin.name); assert.equal(unchanged.sessionVersion, 0);
        assert.equal(await AuditLog.countDocuments(), auditCount);
        assert.equal((await request(admin, "/api/admin/staff")).status, 200);
      });

      await t.test("normal staff edits, validation and supported demotion keep their behavior", async () => {
        await resetAdmins(); const admin = await account(), other = await account();
        const edited = await patch(admin, admin, { name: "Updated owned admin", role: "admin" });
        assert.equal(edited.status, 200); assert.equal(edited.body.data.name, "Updated owned admin");
        assert.equal((await patch(admin, other, { role: "invalid" })).status, 400);
        const response = await patch(admin, other, { role: "manager" });
        assert.equal(response.status, 200); assert.equal(response.body.data.role, "manager");
        assert.equal((await request(other, "/api/admin/staff")).status, 401, "Role changes still revoke old sessions");
        assert.equal(await User.countDocuments({ role: "admin", isActive: { $ne: false } }), 1);
      });

      await t.test("concurrent self-demotions preserve an active admin on a fresh lock", async () => {
        await resetAdmins(); const a = await account(), b = await account();
        await Counter.deleteOne({ _id: "staff-admin-access-guard" });
        const results = await Promise.all([patch(a, a, { role: "manager" }), patch(b, b, { role: "manager" })]);
        assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
        assert.equal(await User.countDocuments({ role: "admin", isActive: { $ne: false } }), 1);
      });

      await t.test("concurrent cross-deactivations recheck the actor inside the transaction", async () => {
        await resetAdmins(); const a = await account(), b = await account();
        const results = await Promise.all([request(a, `/api/admin/staff/${b._id}/active`, "POST", { active: false }), request(b, `/api/admin/staff/${a._id}/active`, "POST", { active: false })]);
        assert.equal(results.filter(row => row.status === 200).length, 1);
        assert.ok(results.some(row => [401, 403].includes(row.status)));
        assert.equal(await User.countDocuments({ role: "admin", isActive: { $ne: false } }), 1);
      });

      await t.test("mixed demotion/deactivation cannot remove both admins", async () => {
        await resetAdmins(); const a = await account(), b = await account();
        const results = await Promise.all([patch(a, a, { role: "manager" }), request(a, `/api/admin/staff/${b._id}/active`, "POST", { active: false })]);
        assert.equal(results.filter(row => row.status === 200).length, 1);
        assert.ok(results.some(row => [401, 403, 409].includes(row.status)));
        assert.equal(await User.countDocuments({ role: "admin", isActive: { $ne: false } }), 1);
      });

      await t.test("an audit failure rolls back role, profile and session changes", async () => {
        await resetAdmins(); const admin = await account(), other = await account();
        const create = AuditLog.create;
        try {
          AuditLog.create = async () => { throw new Error("Owned injected audit failure"); };
          assert.equal((await patch(admin, other, { role: "manager", name: "Rollback me" })).status, 500);
        } finally { AuditLog.create = create; }
        const unchanged = await User.findById(other._id).select("+sessionVersion");
        assert.equal(unchanged.name, other.name); assert.equal(unchanged.role, "admin"); assert.equal(unchanged.sessionVersion, 0);
      });

      await t.test("accountants retain payables access without inventory or approval writes", async () => {
        const accountant = await account("accountant");
        assert.equal((await request(accountant, "/api/inventory/supplier-invoices")).status, 200);
        assert.equal((await request(accountant, "/api/inventory/purchasing-actions")).status, 200);
        assert.equal((await request(accountant, "/api/inventory/items", "POST", {})).status, 403);
        assert.equal((await request(accountant, "/api/inventory/settings", "PATCH", {})).status, 403);
        assert.equal((await request(accountant, `/api/inventory/counts/${category._id}/complete`, "POST", { items: [] })).status, 403);
        assert.equal((await request(accountant, `/api/inventory/supplier-invoices/${category._id}/status`, "PATCH", { status: "posted" })).status, 403);
      });

      await t.test("report pages are stable when names/stock tie and reads preserve stock/payment records", async () => {
        const admin = await account();
        for (const type of ["valuation", "low_stock"]) {
          const a = await request(admin, `/api/inventory/reports?type=${type}&page=1&limit=100`);
          const b = await request(admin, `/api/inventory/reports?type=${type}&page=2&limit=100`);
          assert.equal(a.status, 200); assert.equal(b.status, 200);
          assert.equal(a.body.pagination.total, 137);
          const ids = [...a.body.data, ...b.body.data].map(row => row._id);
          assert.equal(ids.length, 137); assert.equal(new Set(ids).size, 137);
          const repeat = await request(admin, `/api/inventory/reports?type=${type}&page=1&limit=100`);
          assert.deepEqual(repeat.body.data.map(row => row._id), a.body.data.map(row => row._id));
        }
        assert.equal((await request(admin, "/api/inventory/counts")).status, 200);
        assert.deepEqual(await snapshot(), before);
      });
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
