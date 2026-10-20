import assert from "node:assert/strict";
import { test } from "node:test";
import { printDiningTableQr, printOrderInvoice, printPosReceipt } from "../src/utils/adminExports.js";

test("table details appear safely in order invoices and POS reprints, without changing legacy receipts", () => {
  const previous = globalThis.window;
  let html = "";
  globalThis.window = { open: () => ({ document: { write: value => { html = value; }, close() {} } }) };
  try {
    const order = { orderNumber: "DG-TEST", orderType: "dine-in", createdAt: "2026-10-19T10:00:00Z", items: [], subtotal: 20, totalAmount: 20, diningTable: { code: "T-01", name: '<script>alert("test")</script>' } };
    assert.equal(printOrderInvoice(order), true);
    assert.match(html, /Table T-01/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.equal(printPosReceipt(order), true);
    assert.match(html, /T-01/);
    delete order.diningTable;
    assert.equal(printOrderInvoice(order), true);
    assert.doesNotMatch(html, /Table T-01/);
  } finally { globalThis.window = previous; }
});

test("printable QR has an English table label, locally generated image and popup-blocked feedback", () => {
  const previous = globalThis.window;
  let html = "";
  try {
    globalThis.window = { open: () => null };
    assert.equal(printDiningTableQr({ code: "T-01" }), false);
    globalThis.window = { open: () => ({ document: { write: value => { html = value; }, close() {} } }) };
    assert.equal(printDiningTableQr({ code: "T-01", name: "Window & garden", image: "data:image/png;base64,ownedfixture" }), true);
    assert.match(html, /Table T-01/);
    assert.match(html, /Window &amp; garden/);
    assert.match(html, /data:image\/png;base64,ownedfixture/);
    assert.match(html, /Scan to view the menu and order at this table/);
  } finally { globalThis.window = previous; }
});
