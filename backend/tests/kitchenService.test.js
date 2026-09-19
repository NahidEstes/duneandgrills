import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { authorize } from "../middleware/auth.js";
import { resolveKitchenTransition, serializeKitchenOrder } from "../services/kitchenService.js";

test("kitchen workflow accepts only the next valid state", () => {
  assert.equal(resolveKitchenTransition("pending", "confirmed").timestamp, "acceptedAt");
  assert.equal(resolveKitchenTransition("confirmed", "preparing").timestamp, "preparationStartedAt");
  assert.equal(resolveKitchenTransition("preparing", "ready").timestamp, "readyAt");
  assert.throws(() => resolveKitchenTransition("pending", "ready"), /must be preparing/);
  assert.throws(() => resolveKitchenTransition("ready", "ready"), /already ready/);
});

test("kitchen serialization excludes customer and financial secrets", () => {
  const serialized = serializeKitchenOrder({
    _id: new mongoose.Types.ObjectId(),
    orderNumber: "TEST-1",
    status: "pending",
    source: "website",
    orderType: "delivery",
    createdAt: new Date(),
    customer: { name: "Guest", phone: "0500000000", address: "Private" },
    totalAmount: 99,
    paymentMethod: "card",
    items: [{
      name: "Burger",
      quantity: 2,
      price: 25,
      selectedAddOns: [{ name: "Extra Cheese", price: 3 }],
      spiceLevel: "hot",
      itemNote: "No onions",
      comboItems: [],
    }],
  });
  assert.equal(serialized.customerName, "Guest");
  assert.equal("customer" in serialized, false);
  assert.equal("totalAmount" in serialized, false);
  assert.equal("paymentMethod" in serialized, false);
  assert.equal("price" in serialized.items[0], false);
  assert.deepEqual(serialized.items[0].selectedAddOns, [{ name: "Extra Cheese" }]);
  assert.equal(serialized.items[0].spiceLevel, "hot");
  assert.equal(serialized.items[0].itemNote, "No onions");
});

test("kitchen authorization permits kitchen staff, managers and admins but rejects customers", () => {
  const middleware = authorize("admin", "manager", "kitchen");
  for (const role of ["admin", "manager", "kitchen"]) {
    let continued = false;
    middleware({ user: { role } }, {}, () => { continued = true; });
    assert.equal(continued, true);
  }
  let statusCode;
  let body;
  middleware(
    { user: { role: "customer" } },
    { status(code) { statusCode = code; return this; }, json(value) { body = value; return value; } },
    () => assert.fail("customer request must not continue")
  );
  assert.equal(statusCode, 403);
  assert.equal(body.success, false);
});
