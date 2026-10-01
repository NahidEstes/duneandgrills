import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { CAPABILITIES } from "../config/permissions.js";
import { requireCapability } from "../middleware/auth.js";
import InventoryItem from "../models/InventoryItem.js";
import {
  normalizeOptionalBrand,
  validateItemPayload,
  validatePurchaseOrderPayload,
} from "../utils/inventoryValidation.js";

test("optional inventory brands are trimmed and whitespace is not persisted", () => {
  assert.equal(normalizeOptionalBrand("  Almarai  "), "Almarai");
  assert.equal(normalizeOptionalBrand("   "), "");
  assert.equal(validateItemPayload({ preferredBrand: "  NADEC " }, { partial: true }).preferredBrand, "NADEC");
});

test("brand validation rejects invalid types and oversized values", () => {
  assert.throws(() => normalizeOptionalBrand({ name: "Almarai" }), /must be a string/);
  assert.throws(() => normalizeOptionalBrand("x".repeat(121)), /120 characters or fewer/);
});

test("purchase-order requested brand is optional and normalized", () => {
  const item = new mongoose.Types.ObjectId();
  const withBrand = validatePurchaseOrderPayload({
    supplier: new mongoose.Types.ObjectId(),
    items: [{ item, quantity: 1, unitCost: 10, requestedBrand: "  Almarai  " }],
  });
  const brandless = validatePurchaseOrderPayload({
    supplier: new mongoose.Types.ObjectId(),
    items: [{ item, quantity: 1, unitCost: 10 }],
  });
  assert.equal(withBrand.items[0].requestedBrand, "Almarai");
  assert.equal("requestedBrand" in brandless.items[0], false);
});

test("existing inventory records remain valid without preferred brand", () => {
  const row = new InventoryItem({
    name: "Generic Milk",
    sku: "MILK-FULL-FAT",
    category: new mongoose.Types.ObjectId(),
    unit: "L",
  });
  assert.equal(row.validateSync(), undefined);
  assert.equal(row.preferredBrand, "");
});

test("inventory brand APIs remain protected by existing capabilities", () => {
  const middleware = requireCapability(CAPABILITIES.INVENTORY_WRITE);
  let denied;
  middleware(
    { user: { role: "customer" } },
    { status(code) { denied = code; return this; }, json(payload) { denied = { code: denied, payload }; } },
    () => assert.fail("customer must not reach inventory write handlers")
  );
  assert.equal(denied.code, 403);

  let allowed = false;
  middleware(
    { user: { role: "inventory" } },
    { status() { return this; }, json() {} },
    () => { allowed = true; }
  );
  assert.equal(allowed, true);
});
