import test from "node:test";
import assert from "node:assert/strict";
import { serializeDelivery } from "../services/deliveryContractService.js";
import { riderHistoryQuery } from "../services/riderReadPresentation.js";

const order = {
  _id: "222222222222222222222222", orderNumber: "TEST-PRIVATE", source: "website", orderType: "delivery", deliveryMode: "restaurant",
  status: "preparing", paymentStatus: "pending", totalAmount: 84, inventoryStatus: "not_required",
  customer: { name: "Private customer", address: "Stored customer district and address", phone: "PRIVATE PHONE", email: "PRIVATE EMAIL" }, items: [],
};
const delivery = { _id: "333333333333333333333333", rider: "111111111111111111111111", status: "assigned", revision: 0 };

test("active delivery location comes from the existing order snapshot, not a fabricated area", () => {
  const row = serializeDelivery(delivery, order);
  assert.equal(row.customerAddress, order.customer.address);
  assert.equal(row.customerName, order.customer.name);
  assert.equal(row.restaurantStatus, "preparing");
  assert.equal(row.customerCollectionHalala, 8400);
  assert.doesNotMatch(JSON.stringify(row), /PRIVATE PHONE|PRIVATE EMAIL/);
  assert.equal(serializeDelivery(delivery, { ...order, customer: {} }).customerAddress, "");
});

test("completed list, detail and pending-cash projections do not expose historical recipients", () => {
  for (const detail of [false, true]) {
    const row = serializeDelivery({ ...delivery, status: "delivered" }, { ...order, status: "delivered" }, null, { detail });
    assert.equal(row.customerName, "Completed delivery");
    assert.ok(!Object.hasOwn(row, "customerAddress"));
    assert.doesNotMatch(JSON.stringify(row), /Private customer|Stored customer|PRIVATE PHONE|PRIVATE EMAIL/);
    if (detail) assert.equal(row.customer, null);
  }
});

test("completed date filtering crosses UTC midnight using the Riyadh business day", () => {
  const range = riderHistoryQuery({ history: "true", datePeriod: "today" }, new Date("2026-10-14T21:30:00Z")).deliveredAt;
  assert.equal(range.$gte.toISOString(), "2026-10-14T21:00:00.000Z");
  assert.equal(range.$lt.toISOString(), "2026-10-15T21:00:00.000Z");
});
