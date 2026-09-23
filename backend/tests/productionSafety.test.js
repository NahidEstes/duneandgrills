import assert from "node:assert/strict";
import test from "node:test";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { getRiyadhDateKey } from "../services/orderNumberService.js";
import { serializeGuestTrackingOrder } from "../services/orderSerializer.js";
import { csrfCookieOptions, sessionCookieOptions } from "../utils/httpCookies.js";
import { validateNewPassword } from "../controllers/authController.js";
import mongoose from "mongoose";
import { runInventoryTransaction } from "../services/inventoryStockService.js";
import { requireCapability } from "../middleware/auth.js";

test("Riyadh order date follows the restaurant calendar at UTC boundary", () => {
  assert.equal(getRiyadhDateKey(new Date("2026-09-22T21:30:00.000Z")), "20260923");
  assert.equal(getRiyadhDateKey(new Date("2026-09-23T20:59:59.000Z")), "20260923");
  assert.equal(getRiyadhDateKey(new Date("2026-09-23T21:00:00.000Z")), "20260924");
});

test("guest tracking serializer uses an explicit safe allowlist", () => {
  const result = serializeGuestTrackingOrder({
    _id: "internal-id", orderNumber: "DG-20260923-0001", source: "website",
    customer: { name: "Private", phone: "0500000000", address: "Private" },
    notes: "internal note", inventoryTransactions: ["secret"], trackingTokenHash: "secret",
    items: [{ name: "Burger", quantity: 2, price: 12, selectedAddOns: [{ name: "Sauce", price: 1, addOn: "internal" }] }],
    subtotal: 24, discountAmount: 0, deliveryFee: 0, totalAmount: 24, status: "preparing",
  });
  assert.equal(result.orderNumber, "DG-20260923-0001");
  assert.equal(result.items[0].selectedAddOns[0].name, "Sauce");
  for (const forbidden of ["_id", "source", "customer", "notes", "inventoryTransactions", "trackingTokenHash"]) assert.equal(forbidden in result, false);
  assert.equal("addOn" in result.items[0].selectedAddOns[0], false);
});

test("central capability matrix separates operational roles", () => {
  assert.equal(hasCapability("admin", CAPABILITIES.STAFF_MANAGE), true);
  assert.equal(hasCapability("cashier", CAPABILITIES.POS_OPERATE), true);
  assert.equal(hasCapability("cashier", CAPABILITIES.INVENTORY_WRITE), false);
  assert.equal(hasCapability("kitchen", CAPABILITIES.KITCHEN_OPERATE), true);
  assert.equal(hasCapability("accountant", CAPABILITIES.FINANCE_WRITE), true);
  assert.equal(hasCapability("accountant", CAPABILITIES.INVENTORY_WRITE), false);
});

test("capability middleware rejects a UI-bypass attempt with 403", () => {
  let statusCode = 200;
  let nextCalled = false;
  requireCapability(CAPABILITIES.FINANCE_WRITE)(
    { user: { role: "cashier" } },
    { status(code) { statusCode = code; return this; }, json() {} },
    () => { nextCalled = true; }
  );
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);
});

test("production session cookie is HttpOnly and Secure", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  assert.equal(sessionCookieOptions().httpOnly, true);
  assert.equal(sessionCookieOptions().secure, true);
  assert.equal(csrfCookieOptions().httpOnly, false);
  process.env.NODE_ENV = previous;
});

test("new password policy requires mixed strong passwords", () => {
  assert.match(validateNewPassword("weakpass"), /at least 10/);
  assert.equal(validateNewPassword("StrongPass123!"), "");
});

test("production inventory transaction failure never uses the standalone fallback", async () => {
  const originalStartSession = mongoose.startSession;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFallback = process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY;
  mongoose.startSession = async () => ({
    async withTransaction() { const error = new Error("Transaction numbers are only allowed on a replica set member"); error.code = 20; throw error; },
    async endSession() {},
  });
  process.env.NODE_ENV = "production";
  process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "true";
  try {
    await assert.rejects(runInventoryTransaction(async () => "unsafe"), (error) => error.code === "INVENTORY_TRANSACTION_UNAVAILABLE" && error.status === 503);
  } finally {
    mongoose.startSession = originalStartSession;
    process.env.NODE_ENV = previousNodeEnv;
    process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = previousFallback;
  }
});

test("standalone fallback requires the explicit non-production flag", async () => {
  const originalStartSession = mongoose.startSession;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFallback = process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY;
  mongoose.startSession = async () => ({
    async withTransaction() { const error = new Error("transactions are not supported"); error.code = 20; throw error; },
    async endSession() {},
  });
  process.env.NODE_ENV = "test";
  process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "true";
  try {
    assert.equal(await runInventoryTransaction(async (session) => session === null ? "explicit-fallback" : "transaction"), "explicit-fallback");
  } finally {
    mongoose.startSession = originalStartSession;
    process.env.NODE_ENV = previousNodeEnv;
    process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = previousFallback;
  }
});
