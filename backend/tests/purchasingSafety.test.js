import assert from "node:assert/strict";
import { test } from "node:test";
import { requirePurchasingTransaction, receiptKey, purchaseQuantity } from "../services/purchasingSafetyService.js";
import { billableLineAvailability, invoiceMatchingPayload } from "../services/supplierInvoiceMatchingService.js";

test("receipt and invoice safety fail closed without a transaction, even with development fallback enabled", () => {
  assert.throws(() => requirePurchasingTransaction(null), error => error.status === 503);
  assert.doesNotThrow(() => requirePurchasingTransaction({}));
  for (const value of ["", "  ", null, 123, "x".repeat(129)]) assert.throws(() => receiptKey(value), /idempotency key/);
  assert.equal(receiptKey(" retry-key "), "retry-key"); assert.equal(purchaseQuantity(0.1 + 0.2), 0.3);
});
test("remaining invoice quantity uses cumulative commitments and a single ordered-quantity tolerance", () => {
  const row = billableLineAvailability({ _id: "po" }, { _id: "line", itemName: "Milk", quantity: 10, receivedQuantity: 4 }, new Map([["po:line", 3]]), { invoiceQuantityTolerancePercent: 10 });
  assert.equal(row.remainingBillableQuantity, 1); assert.equal(row.maximumBillableQuantity, 2); assert.equal(row.toleranceQuantity, 1);
});
test("revalidation preserves header versus line adjustments without double counting", () => {
  const payload = invoiceMatchingPayload({ supplier: "supplier", tax: 5, discount: 3, additionalCharges: 2, items: [{ tax: 2, discount: 1 }] });
  assert.equal(payload.tax, 3); assert.equal(payload.discount, 2); assert.equal(payload.additionalCharges, 2); assert.deepEqual(payload.items, [{ tax: 2, discount: 1 }]);
});
