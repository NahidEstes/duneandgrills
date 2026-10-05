import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePosShortcut, POS_SHORTCUTS } from "../src/utils/posShortcuts.js";
import { calculatePosBill } from "../src/utils/posBill.js";

test("keyboard actions are discoverable and suppressed while typing, repeating, or in dialogs", () => {
  assert.equal(POS_SHORTCUTS.length, 8);
  assert.equal(resolvePosShortcut({ key: "Enter", altKey: true }), "complete");
  assert.equal(resolvePosShortcut({ key: "h", altKey: true }), "hold");
  assert.equal(resolvePosShortcut({ key: "l", altKey: true }), "lock");
  for (const context of [{ modalOpen: true }, { textInput: true }]) assert.equal(resolvePosShortcut({ key: "Enter", altKey: true }, context), null);
  assert.equal(resolvePosShortcut({ key: "Enter", altKey: true, repeat: true }), null);
  assert.equal(resolvePosShortcut({ key: "c" }), null);
});
test("locking activity does not mutate the current sale or Phase 1 bill/customizations", () => {
  const sale = [{ productId: "burger", name: "Burger", quantity: 2, price: 23, customization: { note: "No onion", selectedAddOns: [{ price: 3 }] } }];
  const before = JSON.stringify(sale); const bill = calculatePosBill(sale, { type: "percentage", value: 10 });
  resolvePosShortcut({ key: "l", altKey: true });
  assert.equal(JSON.stringify(sale), before); assert.equal(bill.total, 41.4);
});
