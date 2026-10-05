import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryBatch from "../models/InventoryBatch.js";
import StockTransaction from "../models/StockTransaction.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import Supplier from "../models/Supplier.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import SupplierPayment from "../models/SupplierPayment.js";
import PurchasePriceHistory from "../models/PurchasePriceHistory.js";
import ReorderSuggestion from "../models/ReorderSuggestion.js";
import AuditLog from "../models/AuditLog.js";
import inventoryRoutes from "../routes/inventoryRoutes.js";
import { createPurchaseOrder, receivePurchaseOrder, transitionPurchaseOrder } from "../services/purchaseOrderService.js";
import { createSupplierInvoice, updateSupplierInvoice, transitionSupplierInvoice, recordSupplierPayment, reverseSupplierPayment } from "../services/supplierInvoiceService.js";
import { BILLABLE_RESERVATION_STATUSES, committedInvoiceQuantities, billableLineAvailability } from "../services/supplierInvoiceMatchingService.js";
import { collectReorderInputs } from "../services/reorderService.js";

// No dotenv/external URI/reset. Only the helper-owned temporary replica set is used.
process.env.NODE_ENV = "test";
process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "false";
process.env.JWT_SECRET = "isolated-purchasing-safety-secret";
const policy = { purchaseApprovalThreshold: 1000000, overReceiveTolerancePercent: 0, invoiceQuantityTolerancePercent: 0, invoicePriceTolerancePercent: 2, invoicePriceToleranceAmount: 1, largePaymentThreshold: 10000 };

test("Phase 2 purchasing and supplier invoice safety (isolated replica set)", { timeout: 240000 }, async t => {
  await withIsolatedMongo(async () => {
    const user = role => User.create({ name: role, email: `${role}@purchase.test`, password: "TestPassword123!", role });
    const admin = await user("admin"); const manager = await user("manager"); const buyer = await user("inventory"); const accountant = await user("accountant"); const customer = await user("customer");
    const category = await InventoryCategory.create({ name: "Purchasing fixtures", skuPrefix: "PS" });
    const supplier = await Supplier.create({ code: "PS-SUP", name: "Purchasing fixture supplier" });
    let sequence = 0;
    const item = options => InventoryItem.create({ name: `Goods ${++sequence}`, sku: `PS-${sequence}`, category: category._id, unit: "kg", purchaseUnit: "carton", purchaseConversionFactor: 2, unitCost: 5, tracksExpiry: true, preferredBrand: "Preferred", ...options });
    const ordered = async (quantities = [10], settings = policy) => {
      const ingredients = await Promise.all(quantities.map(() => item()));
      const po = await createPurchaseOrder({ supplier: supplier._id, items: ingredients.map((row, index) => ({ item: row._id, quantity: quantities[index], unitCost: 10 })) }, buyer, settings);
      for (const target of ["submitted", "approved", "ordered"]) await transitionPurchaseOrder({ id: po._id, target, actor: target === "approved" ? manager : buyer, settings });
      return PurchaseOrder.findById(po._id);
    };
    const receipt = (po, entries, options = {}) => receivePurchaseOrder(po._id, entries.map(([index, quantity, extra = {}]) => ({ lineId: po.items[index]._id, quantity, expiryDate: "2099-12-31", ...extra })), options.actor || buyer, options.notes || "", options.settings || policy, options.key || crypto.randomUUID());
    const full = async (quantity = 10) => { const po = await ordered([quantity]); await receipt(po, [[0, quantity]]); return PurchaseOrder.findById(po._id); };
    const invoicePayload = (po, quantity, options = {}) => ({ supplier: supplier._id, supplierInvoiceNumber: `PS-INV-${++sequence}`, invoiceDate: "2026-10-05", items: [{ item: po.items[0].item, purchaseOrder: po._id, purchaseOrderLine: po.items[0]._id, quantity, unitPrice: 10 }], ...options });
    const invoice = (po, quantity, options = {}, settings = policy) => createSupplierInvoice(invoicePayload(po, quantity, options), accountant, settings);
    const transition = (row, target, options = {}) => transitionSupplierInvoice({ id: row._id, target, actor: options.actor || manager, settings: options.settings || policy, reason: options.reason || "", idempotencyKey: options.key || crypto.randomUUID() });
    const availability = async (po, excludeInvoiceId) => billableLineAvailability(po, po.items[0], await committedInvoiceQuantities([po._id], { excludeInvoiceId }), policy);
    const counts = () => Promise.all([InventoryBatch.countDocuments(), StockTransaction.countDocuments(), AuditLog.countDocuments(), PurchasePriceHistory.countDocuments()]);

    await t.test("only delivered line receives stock; conversions, actual brand, lot and expiry survive", async () => {
      const po = await ordered([10, 5]);
      const result = await receipt(po, [[0, 4, { brand: "Actual brand", lotNumber: "PS-A" }]]);
      assert.equal(result.order.status, "partially_received"); assert.equal(result.order.items[0].receivedQuantity, 4); assert.equal(result.order.items[1].receivedQuantity, 0);
      assert.equal((await InventoryItem.findById(po.items[0].item)).currentStock, 8); assert.equal((await InventoryItem.findById(po.items[1].item)).currentStock, 0);
      const batch = await InventoryBatch.findOne({ item: po.items[0].item });
      assert.equal(batch.brand, "Actual brand"); assert.equal(batch.lotNumber, "PS-A"); assert.equal(batch.unitCost, 5); assert.equal(batch.expiryDate.toISOString().slice(0, 10), "2099-12-31");
      assert.equal(await PurchasePriceHistory.countDocuments({ purchaseOrder: po._id, priceType: "received" }), 1);
      await receipt(po, [[0, 6]]); await receipt(po, [[1, 5]]);
      const current = await PurchaseOrder.findById(po._id); assert.equal(current.status, "received"); assert.equal(current.items[1].receivedQuantity, 5);
      assert.equal((await InventoryBatch.findOne({ item: po.items[1].item })).brand, "Preferred");
    });

    await t.test("mandatory key, duplicate/zero/malformed receipt lines reject without writes", async () => {
      const po = await ordered([10]); const before = await counts();
      await assert.rejects(receivePurchaseOrder(po._id, [{ lineId: po.items[0]._id, quantity: 1 }], buyer), /idempotency key/i);
      await assert.rejects(receipt(po, [[0, 1], [0, 1]]), /Duplicate/);
      await assert.rejects(receipt(po, [[0, 0]]), /positive/);
      await assert.rejects(receivePurchaseOrder(po._id, [null], buyer, "", policy, "bad-line"), /Invalid receipt/);
      assert.deepEqual(await counts(), before);
    });

    await t.test("timeout/retry returns original result after another receipt and completion", async () => {
      const po = await ordered([10]); const key = crypto.randomUUID();
      const first = await receipt(po, [[0, 4, { lotNumber: "RETRY-LOT", notes: "Same request" }]], { key });
      await receipt(po, [[0, 6]]); const before = await counts();
      const repeated = await receipt(po, [[0, 4, { lotNumber: "RETRY-LOT", notes: "Same request" }]], { key });
      assert.equal(repeated.duplicate, true); assert.deepEqual(repeated.order.toObject(), first.order.toObject());
      assert.deepEqual(repeated.movements.map(row => row.toObject()), first.movements.map(row => row.toObject())); assert.deepEqual(await counts(), before);
      await assert.rejects(receipt(po, [[0, 5]], { key }), /different submission/);
      assert.equal((await PurchaseOrder.findById(po._id)).items[0].receivedQuantity, 10);
    });

    await t.test("concurrent double-click using same key creates exactly one receipt", async () => {
      const po = await ordered([10]); const key = crypto.randomUUID();
      const results = await Promise.all([receipt(po, [[0, 10]], { key }), receipt(po, [[0, 10]], { key })]);
      assert.equal(results.filter(row => row.duplicate).length, 1);
      assert.equal(await StockTransaction.countDocuments({ purchaseOrder: po._id, movementType: "PURCHASE_RECEIPT" }), 1);
      assert.equal((await InventoryItem.findById(po.items[0].item)).currentStock, 20);
    });

    await t.test("concurrent different receipts cannot exceed remaining quantity", async () => {
      const po = await ordered([10]); const results = await Promise.allSettled([receipt(po, [[0, 7]]), receipt(po, [[0, 7]])]);
      assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
      assert.equal((await PurchaseOrder.findById(po._id)).items[0].receivedQuantity, 7);
      assert.equal((await InventoryItem.findById(po.items[0].item)).currentStock, 14);
    });

    await t.test("over-receive uses cumulative tolerance, manager authorization, reason and audit", async () => {
      const settings = { ...policy, overReceiveTolerancePercent: 10 }; const po = await ordered([10], settings);
      await receipt(po, [[0, 8]], { settings });
      await assert.rejects(receipt(po, [[0, 3]], { settings, notes: "Allowed?" }), /Manager\/Admin/);
      await assert.rejects(receipt(po, [[0, 3]], { settings, actor: manager }), /reason/);
      await assert.rejects(receipt(po, [[0, 4]], { settings, actor: manager, notes: "Reason" }), /exceeds/);
      const result = await receipt(po, [[0, 3, { overrideReason: "Sealed carton overage" }]], { settings, actor: manager });
      assert.equal(result.order.items[0].receivedQuantity, 11);
      const movement = result.movements[0]; assert.equal(movement.sourceDetails.overrideReason, "Sealed carton overage");
      const audit = await AuditLog.findOne({ entityId: po._id, action: "PURCHASE_ORDER_RECEIVED" }); assert.equal(audit.after.receivedLines[0].overrideReason, "Sealed carton overage");
    });

    await t.test("incomplete Received blocked; Closed Short authorized/reasoned and creates no stock", async () => {
      const po = await ordered([10, 10]); await receipt(po, [[0, 4]]); const before = await counts();
      await assert.rejects(transitionPurchaseOrder({ id: po._id, target: "received", actor: admin, settings: policy }), /Incomplete/);
      await assert.rejects(transitionPurchaseOrder({ id: po._id, target: "closed_short", actor: buyer, settings: policy, reason: "Not arriving" }), /authorization/);
      await assert.rejects(transitionPurchaseOrder({ id: po._id, target: "closed_short", actor: manager, settings: policy }), /reason/);
      const beforeInput = await collectReorderInputs(await InventoryItem.findById(po.items[0].item));
      assert.equal(beforeInput.confirmedInbound, 12);
      await transitionPurchaseOrder({ id: po._id, target: "closed_short", actor: manager, settings: policy, reason: "Supplier cannot fulfill balance" });
      const after = await counts(); assert.deepEqual(after.slice(0, 2), before.slice(0, 2));
      assert.equal((await PurchaseOrder.findById(po._id)).items[0].receivedQuantity, 4);
      assert.equal((await collectReorderInputs(await InventoryItem.findById(po.items[0].item))).confirmedInbound, 0);
    });

    await t.test("receipt audit failure rolls back stock, batches, PO, key, movements and prices", async () => {
      const po = await ordered([10, 5]); const before = await counts(); const create = AuditLog.create;
      AuditLog.create = async function (...args) {
        if (args[0]?.[0]?.action?.startsWith("PURCHASE_ORDER_")) throw new Error("Injected receipt audit failure");
        return create.apply(this, args);
      };
      try { await assert.rejects(receipt(po, [[0, 4], [1, 3]]), /Injected/); } finally { AuditLog.create = create; }
      assert.deepEqual(await counts(), before); const current = await PurchaseOrder.findById(po._id);
      assert.equal(current.status, "ordered"); assert.equal(current.receiptKeys.length, 0); assert.equal(current.items[0].receivedQuantity, 0);
      assert.equal((await InventoryItem.findById(po.items[0].item)).currentStock, 0);
    });

    await t.test("late invalid receipt line leaves no partially received first line", async () => {
      const po = await ordered([5, 5]); const before = await counts();
      await assert.rejects(receipt(po, [[0, 2], [1, 6]]), /exceeds/); assert.deepEqual(await counts(), before);
    });

    await t.test("draft does not reserve; legitimate split invoices reserve only their quantities", async () => {
      const po = await full(); const a = await invoice(po, 4); const b = await invoice(po, 6);
      assert.equal((await availability(po)).remainingBillableQuantity, 10);
      await transition(a, "submitted"); assert.equal((await availability(po)).remainingBillableQuantity, 6);
      await transition(b, "submitted"); assert.equal((await availability(po)).remainingBillableQuantity, 0);
      for (const row of [a, b]) { await transition(row, "approved"); await transition(row, "posted"); }
      assert.equal((await availability(po)).committedQuantity, 10);
    });

    await t.test("two different invoice numbers cannot bill the same goods twice", async () => {
      const po = await full(); const a = await invoice(po, 10); const b = await invoice(po, 10);
      await transition(a, "submitted"); await assert.rejects(transition(b, "submitted", { reason: "No bypass" }), /remaining billable/);
      assert.equal((await SupplierInvoice.findById(b._id)).status, "draft");
      await assert.rejects(createSupplierInvoice(invoicePayload(po, 1, { supplierInvoiceNumber: a.supplierInvoiceNumber.toLowerCase() }), manager, policy), /already exists/);
    });

    await t.test("concurrent different invoice submission serializes reservations", async () => {
      const po = await full(); const a = await invoice(po, 7); const b = await invoice(po, 7);
      const results = await Promise.allSettled([transition(a, "submitted"), transition(b, "submitted")]);
      assert.equal(results.filter(row => row.status === "fulfilled").length, 1); assert.equal((await availability(po)).committedQuantity, 7);
    });

    await t.test("editing excludes itself and returning review-required invoice to draft releases", async () => {
      const po = await full(); const a = await invoice(po, 4, { items: [{ ...invoicePayload(po, 4).items[0], unitPrice: 20 }] });
      await transition(a, "submitted"); assert.equal((await SupplierInvoice.findById(a._id)).status, "review_required");
      assert.equal((await availability(po, a._id)).remainingBillableQuantity, 10);
      const edited = await updateSupplierInvoice(a._id, {}, manager, policy);
      assert.equal(edited.matchSummary.quantityChecks[0].committedQuantity, 0); assert.equal(edited.status, "draft");
      assert.equal((await availability(po)).committedQuantity, 0);
    });

    await t.test("disputed holds reservation; void releases without changing receipts", async () => {
      assert.deepEqual(BILLABLE_RESERVATION_STATUSES, ["submitted", "review_required", "approved", "posted", "disputed"]);
      const po = await full(); const a = await invoice(po, 10); await transition(a, "submitted");
      await transition(a, "disputed", { reason: "Supplier price disputed" }); assert.equal((await availability(po)).remainingBillableQuantity, 0);
      await transition(a, "voided", { reason: "Invoice cancelled by supplier" }); assert.equal((await availability(po)).remainingBillableQuantity, 10);
      assert.equal((await PurchaseOrder.findById(po._id)).items[0].receivedQuantity, 10);
      const replacement = await invoice(po, 10); await transition(replacement, "submitted");
      const audit = await AuditLog.findOne({ entityId: a._id, action: "SUPPLIER_INVOICE_VOIDED" }); assert.equal(audit.metadata.reservationReleased, true);
    });

    await t.test("within-tolerance overbilling is never matched and requires authorized explicit reason", async () => {
      const settings = { ...policy, invoiceQuantityTolerancePercent: 10 }; const po = await full();
      const a = await invoice(po, 10.5, {}, settings); assert.ok(a.matchSummary.mismatches > 0);
      await assert.rejects(transition(a, "submitted", { actor: accountant, settings, reason: "Not authorized" }), /Manager\/Admin/);
      await assert.rejects(transition(a, "submitted", { settings }), /override reason/);
      await transition(a, "submitted", { settings, reason: "Approved measured weight variance" });
      await transition(a, "approved", { settings, reason: "Manager reviewed variance" });
      await transition(a, "posted", { settings, reason: "Posting approved weight variance" });
      const audit = await AuditLog.findOne({ entityId: a._id, action: "SUPPLIER_INVOICE_POSTED" }); assert.equal(audit.metadata.quantityOverrides.length, 1);
      const b = await invoice(po, 1, {}, settings); await assert.rejects(transition(b, "submitted", { settings, reason: "Cannot bypass cumulative cap" }), /remaining billable/);
    });

    await t.test("submission/approval/posting revalidate current commitments and lowered policy", async () => {
      const settings = { ...policy, invoiceQuantityTolerancePercent: 10 }; const po = await full();
      const a = await invoice(po, 10.5, {}, settings); await transition(a, "submitted", { settings, reason: "Variance" });
      await assert.rejects(transition(a, "approved", { reason: "Policy now zero" }), /remaining billable/);
      await transition(a, "approved", { settings, reason: "Variance remains authorized" });
      await assert.rejects(transition(a, "posted", { reason: "Policy now zero" }), /remaining billable/);
      assert.equal((await SupplierInvoice.findById(a._id)).status, "approved");
      assert.equal(await PurchasePriceHistory.countDocuments({ invoice: a._id, priceType: "invoiced" }), 0);
    });

    await t.test("concurrent approval/posting stays single and preserves partial billing", async () => {
      const po = await full(); const a = await invoice(po, 4); const b = await invoice(po, 6);
      await transition(a, "submitted"); await transition(b, "submitted");
      await Promise.all([transition(a, "approved"), transition(b, "approved")]);
      const key = crypto.randomUUID(); const results = await Promise.all([transition(a, "posted", { key }), transition(a, "posted", { key }), transition(b, "posted")]);
      assert.equal(results.filter(row => row.duplicate).length, 1); assert.equal((await availability(po)).committedQuantity, 10);
      assert.equal(await PurchasePriceHistory.countDocuments({ invoice: a._id, priceType: "invoiced" }), 1);
    });

    await t.test("invoice audit failure rolls back reservation/status and retry can safely succeed", async () => {
      const po = await full(); const a = await invoice(po, 10); const create = AuditLog.create;
      AuditLog.create = async function (...args) {
        if (args[0]?.[0]?.action === "SUPPLIER_INVOICE_SUBMITTED") throw new Error("Injected invoice audit failure");
        return create.apply(this, args);
      };
      try { await assert.rejects(transition(a, "submitted"), /Injected/); } finally { AuditLog.create = create; }
      assert.equal((await SupplierInvoice.findById(a._id)).status, "draft"); assert.equal((await availability(po)).committedQuantity, 0);
      await transition(a, "submitted");
    });

    await t.test("posting audit failure rolls back invoice and all invoiced price records", async () => {
      const po = await full(); const a = await invoice(po, 10);
      await transition(a, "submitted"); await transition(a, "approved"); const before = await counts(); const create = AuditLog.create;
      AuditLog.create = async function (...args) {
        if (args[0]?.[0]?.action === "SUPPLIER_INVOICE_POSTED") throw new Error("Injected posting audit failure");
        return create.apply(this, args);
      };
      try { await assert.rejects(transition(a, "posted"), /Injected/); } finally { AuditLog.create = create; }
      assert.deepEqual(await counts(), before); assert.equal((await SupplierInvoice.findById(a._id)).status, "approved");
      assert.equal(await PurchasePriceHistory.countDocuments({ invoice: a._id, priceType: "invoiced" }), 0);
      await transition(a, "posted");
    });

    await t.test("historical records without new fields work; legacy receipt key never adds stock again", async () => {
      const po = await ordered([10]);
      await PurchaseOrder.collection.updateOne({ _id: po._id }, { $unset: { invoiceMatchVersion: "", receiptResults: "" }, $set: { receiptKeys: ["pre-upgrade-receipt"] } });
      const before = await counts(); const duplicate = await receipt(po, [[0, 2]], { key: "pre-upgrade-receipt" });
      assert.equal(duplicate.duplicate, true); assert.equal(duplicate.legacyReceipt, true); assert.deepEqual(await counts(), before);
      await receipt(po, [[0, 10]]); const a = await invoice(po, 10); await transition(a, "submitted");
      assert.equal((await availability(await PurchaseOrder.findById(po._id))).remainingBillableQuantity, 0);
    });

    await t.test("cumulative tolerance is shared across concurrent invoice exceptions, not renewed per invoice", async () => {
      const settings = { ...policy, invoiceQuantityTolerancePercent: 10 }; const po = await full();
      const base = await invoice(po, 10); await transition(base, "submitted");
      const a = await invoice(po, 0.75, {}, settings); const b = await invoice(po, 0.75, {}, settings);
      const results = await Promise.allSettled([transition(a, "submitted", { settings, reason: "Authorized variance A" }), transition(b, "submitted", { settings, reason: "Authorized variance B" })]);
      assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
      assert.equal((await availability(po)).committedQuantity, 10.75);
    });

    await t.test("payment limits, idempotency, concurrent balances and reversal/void safeguards unchanged", async () => {
      const po = await full(); const a = await invoice(po, 10);
      await assert.rejects(recordSupplierPayment({ invoiceId: a._id, payload: { amount: 1, method: "cash", idempotencyKey: "unposted" }, actor: manager, settings: policy }), /not posted/);
      for (const target of ["submitted", "approved", "posted"]) await transition(a, target);
      const pay = key => recordSupplierPayment({ invoiceId: a._id, payload: { amount: 70, method: "cash", idempotencyKey: key }, actor: manager, settings: policy });
      const results = await Promise.allSettled([pay("ps-payment-a"), pay("ps-payment-b")]); assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
      const paid = results.find(row => row.status === "fulfilled").value;
      assert.equal((await pay(paid.payment.idempotencyKey)).duplicate, true);
      await assert.rejects(transition(a, "voided", { reason: "Do not erase payment" }), /Reverse completed payments/);
      await assert.rejects(reverseSupplierPayment({ paymentId: paid.payment._id, actor: accountant, reason: "Unauthorized" }), /authorization/);
      await assert.rejects(reverseSupplierPayment({ paymentId: paid.payment._id, actor: manager }), /reason/);
      await reverseSupplierPayment({ paymentId: paid.payment._id, actor: manager, reason: "Payment failed" });
      await transition(a, "voided", { reason: "Cancel after reversal" });
      assert.equal((await SupplierPayment.findById(paid.payment._id)).status, "reversed"); assert.equal((await availability(po)).remainingBillableQuantity, 10);
    });

    await t.test("HTTP permissions, partial receipt, mandatory key and billable availability", async () => {
      const app = express(); app.use(express.json()); app.use("/inventory", inventoryRoutes); app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
      const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      const call = (path, actor = null, method = "GET", body) => fetch(`${base}/inventory${path}`, { method, headers: { "Content-Type": "application/json", ...(actor ? { Authorization: `Bearer ${jwt.sign({ id: String(actor._id) }, process.env.JWT_SECRET)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      try {
        const po = await ordered([5, 5]);
        await InventoryItem.updateMany({ _id: { $in: po.items.map(row => row.item) } }, { $set: { reorderEnabled: true, reorderLevel: 100, targetStock: 100 } });
        assert.equal((await call("/purchase-orders")).status, 401);
        assert.equal((await call("/purchase-orders", customer)).status, 403);
        assert.equal((await call(`/purchase-orders/${po._id}/receive`, buyer, "POST", { items: [{ lineId: po.items[0]._id, quantity: 2 }] })).status, 400);
        assert.equal((await call(`/purchase-orders/${po._id}/receive`, buyer, "POST", { idempotencyKey: "http-receipt", items: [{ lineId: po.items[0]._id, quantity: 2, expiryDate: "2099-01-01" }] })).status, 200);
        assert.equal((await ReorderSuggestion.findOne({ item: po.items[0].item })).breakdown.confirmedInbound, 6);
        assert.equal((await call(`/purchase-orders/${po._id}/status`, buyer, "PATCH", { status: "closed_short", reason: "Not authorized" })).status, 403);
        assert.equal((await call(`/purchase-orders/${po._id}/status`, manager, "PATCH", { status: "received" })).status, 400);
        assert.equal((await call(`/supplier-invoices/billable-quantities?purchaseOrder=${po._id}`, buyer)).status, 403);
        const preview = await call(`/supplier-invoices/billable-quantities?purchaseOrder=${po._id}`, accountant); assert.equal(preview.status, 200); assert.equal((await preview.json()).data[0].remainingBillableQuantity, 2);
        const a = await invoice(po, 2); await transition(a, "submitted");
        assert.equal((await call(`/supplier-invoices/${a._id}/status`, accountant, "PATCH", { status: "approved" })).status, 403);
        const selfPreview = await call(`/supplier-invoices/billable-quantities?purchaseOrder=${po._id}&excludeInvoiceId=${a._id}`, accountant); assert.equal((await selfPreview.json()).data[0].committedQuantity, 0);
        assert.equal((await call(`/purchase-orders/${po._id}/status`, manager, "PATCH", { status: "closed_short", reason: "Supplier cancelled the balance" })).status, 200);
        assert.equal((await ReorderSuggestion.findOne({ item: po.items[0].item })).breakdown.confirmedInbound, 0);
      } finally { await new Promise(resolve => server.close(resolve)); }
    });
  });
});
