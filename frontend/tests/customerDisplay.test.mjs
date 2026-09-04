import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { calculatePosBill } from "../src/utils/posBill.js";
import { customerSafeBill, startDisplayPublisher, startDisplayReceiver } from "../src/utils/customerDisplaySync.js";

const waitFor = async (condition) => {
  const until = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > until) throw new Error("Timed out waiting for display update");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
const sale = [{ name: "Orange Juice", quantity: 2, price: 12, phone: "PRIVATE", notes: "PRIVATE", token: "PRIVATE" }];
const bill = { ...calculatePosBill(sale, 5), orderType: "takeaway", status: "awaiting-payment" };

test("POS totals are shared and customer snapshot only contains allowed data", () => {
  assert.equal(bill.subtotal, 24);
  assert.equal(bill.discount, 5);
  assert.equal(bill.total, 19);
  assert.equal(bill.items[0].lineTotal, 24);
  assert.equal(calculatePosBill(sale, 99).total, 0);
  assert.equal(calculatePosBill(sale, -1).discount, 0);
  const safe = customerSafeBill({ ...bill, customer: "PRIVATE", token: "PRIVATE", tax: 3, profit: 5, items: [{ ...bill.items[0], addons: ["PRIVATE"], address: "PRIVATE" }] });
  assert.deepEqual(safe, bill);
  assert.ok(!JSON.stringify(safe).includes("PRIVATE"));
  assert.equal(customerSafeBill({ ...bill, total: NaN }), null);
  assert.equal(customerSafeBill({ ...bill, items: [] }), null);
});

test("late open/refresh resync, live updates, cleared bill, and reconnect", async (t) => {
  const session = randomUUID();
  let current = bill;
  let state;
  let publisher = startDisplayPublisher(session, () => current, { heartbeatMs: 30 });
  let receiver = startDisplayReceiver(session, (value) => { state = value; }, { pollMs: 30, staleMs: 120 });
  t.after(() => { receiver.close(); publisher.close(); });
  await waitFor(() => state?.bill?.total === 19);
  receiver.close();
  state = null;
  receiver = startDisplayReceiver(session, (value) => { state = value; }, { pollMs: 30, staleMs: 120 });
  await waitFor(() => state?.bill?.total === 19);
  current = { ...calculatePosBill([{ ...sale[0], quantity: 3 }], 0), status: "processing", orderType: "dine-in" };
  publisher.publish();
  await waitFor(() => state?.bill?.total === 36);
  assert.equal(state.bill.status, "processing");
  // Clear Sale and successful Complete Sale both reset the existing sale array.
  current = calculatePosBill([], 0);
  publisher.publish();
  await waitFor(() => state?.connection === "connected" && state.bill === null);
  publisher.close();
  await waitFor(() => state?.connection === "disconnected" && !state.bill);
  publisher = startDisplayPublisher(session, () => bill, { heartbeatMs: 30 });
  await waitFor(() => state?.bill?.total === 19);
});

test("silent connection loss hides stale bill; sessions cannot mix", async (t) => {
  const session = randomUUID();
  const otherSession = randomUUID();
  let state;
  const receiver = startDisplayReceiver(session, (value) => { state = value; }, { pollMs: 20, staleMs: 80 });
  const other = startDisplayPublisher(otherSession, () => bill, { heartbeatMs: 20 });
  const silent = new BroadcastChannel(`dg-customer-display:${session}`);
  t.after(() => { receiver.close(); other.close(); silent.close(); });
  silent.postMessage({ version: 1, type: "snapshot", bill });
  await waitFor(() => state?.bill?.total === 19);
  await waitFor(() => state?.connection === "disconnected");
  assert.equal(state.bill, null);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(state.connection, "disconnected");
});
