import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchasePriceHistory from "../models/PurchasePriceHistory.js";
import Supplier from "../models/Supplier.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import SupplierPayment from "../models/SupplierPayment.js";
import User from "../models/User.js";
import Expense from "../models/Expense.js";
import {
  createPurchaseOrder,
  receivePurchaseOrder,
  transitionPurchaseOrder,
  updatePurchaseOrder,
} from "../services/purchaseOrderService.js";
import {
  createSupplierInvoice,
  recordSupplierPayment,
  reverseSupplierPayment,
  transitionSupplierInvoice,
  updateSupplierInvoice,
} from "../services/supplierInvoiceService.js";
import { getPriceHistoryReport } from "../services/purchasePriceService.js";

process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "true";
const uri =
  process.env.MONGO_TEST_URI ||
  "mongodb://127.0.0.1:27017/duneandgrills_phase3a_test";
const policy = {
  purchaseApprovalThreshold: 1000,
  overReceiveTolerancePercent: 0,
  invoiceQuantityTolerancePercent: 0,
  invoicePriceTolerancePercent: 2,
  invoicePriceToleranceAmount: 1,
  largePaymentThreshold: 10000,
  priceAlertPercent: 10,
  priceAlertAmount: 5,
  blockPriceIncrease: false,
};

const run = async () => {
  await mongoose.connect(uri);
  if (!mongoose.connection.db.databaseName.endsWith("_test"))
    throw new Error("Refusing to use a non-test database");
  await mongoose.connection.dropDatabase();
  const admin = await User.create({
    name: "Phase 3 Admin",
    email: "phase3-admin@example.com",
    password: " ",
    role: "admin",
  });
  const manager = await User.create({
    name: "Phase 3 Manager",
    email: "phase3-manager@example.com",
    password: "TestPassword123!",
    role: "manager",
  });
  const buyer = await User.create({
    name: "Phase 3 Buyer",
    email: "phase3-buyer@example.com",
    password: "TestPassword123!",
    role: "inventory",
  });
  const category = await InventoryCategory.create({
    name: "Phase 3 Goods",
    skuPrefix: "P3",
  });
  const item = await InventoryItem.create({
    name: "Phase 3 Ingredient",
    sku: "INV-P3-001",
    category: category._id,
    unit: "kg",
    purchaseUnit: "carton",
    purchaseConversionFactor: 10,
    unitCost: 9,
  });
  const supplier = await Supplier.create({
    code: "P3-SUP",
    name: "Phase 3 Supplier",
  });

  const po = await createPurchaseOrder(
    {
      supplier: supplier._id,
      items: [{ item: item._id, quantity: 10, unitCost: 100 }],
      tax: 0,
      discount: 0,
      additionalCharges: 0,
    },
    buyer,
    policy
  );
  assert.equal(po.status, "draft");
  assert.equal(po.total, 1000);
  assert.equal(po.revision, 1);
  await transitionPurchaseOrder({
    id: po._id,
    target: "submitted",
    actor: buyer,
    settings: policy,
    idempotencyKey: "p3-submit-1",
  });
  const approval = await transitionPurchaseOrder({
    id: po._id,
    target: "approved",
    actor: manager,
    settings: policy,
    idempotencyKey: "p3-approve-1",
  });
  assert.equal(approval.po.status, "approved");
  const duplicateApproval = await transitionPurchaseOrder({
    id: po._id,
    target: "approved",
    actor: manager,
    settings: policy,
    idempotencyKey: "p3-approve-1",
  });
  assert.equal(duplicateApproval.duplicate, true);
  await transitionPurchaseOrder({
    id: po._id,
    target: "ordered",
    actor: buyer,
    settings: policy,
    idempotencyKey: "p3-order-1",
  });
  const partial = await receivePurchaseOrder(
    po._id,
    [{ lineId: po.items[0]._id, quantity: 4, lotNumber: "P3-A" }],
    buyer,
    "Partial",
    policy,
    "p3-receive-1"
  );
  assert.equal(partial.order.status, "partially_received");
  const receiptRetry = await receivePurchaseOrder(
    po._id,
    [{ lineId: po.items[0]._id, quantity: 4 }],
    buyer,
    "Retry",
    policy,
    "p3-receive-1"
  );
  assert.equal(receiptRetry.duplicate, true);
  await assert.rejects(
    receivePurchaseOrder(
      po._id,
      [{ lineId: po.items[0]._id, quantity: 7 }],
      buyer,
      "Over",
      policy,
      "p3-over"
    ),
    /exceeds/
  );
  const complete = await receivePurchaseOrder(
    po._id,
    [{ lineId: po.items[0]._id, quantity: 6, lotNumber: "P3-B" }],
    buyer,
    "Complete",
    policy,
    "p3-receive-2"
  );
  assert.equal(complete.order.status, "received");
  assert.equal((await InventoryItem.findById(item._id)).currentStock, 100);

  const invoicePayload = {
    supplier: supplier._id,
    supplierInvoiceNumber: " Inv 001 ",
    invoiceDate: "2026-09-24",
    dueDate: "2026-10-24",
    items: [
      {
        item: item._id,
        purchaseOrder: po._id,
        purchaseOrderLine: po.items[0]._id,
        quantity: 10,
        unitPrice: 100,
      },
    ],
    tax: 0,
    discount: 0,
    additionalCharges: 0,
  };
  const invoice = await createSupplierInvoice(invoicePayload, manager, policy);
  assert.equal(invoice.total, 1000);
  assert.equal(invoice.matchSummary.mismatches, 0);
  assert.equal(
    await Expense.countDocuments(),
    0,
    "supplier invoices must not be duplicated into operating expenses"
  );
  await assert.rejects(
    createSupplierInvoice(
      { ...invoicePayload, supplierInvoiceNumber: "INV   001" },
      manager,
      policy
    ),
    /already exists/i
  );
  await transitionSupplierInvoice({
    id: invoice._id,
    target: "submitted",
    actor: manager,
    settings: policy,
    idempotencyKey: "inv-submit",
  });
  await transitionSupplierInvoice({
    id: invoice._id,
    target: "approved",
    actor: manager,
    settings: policy,
    idempotencyKey: "inv-approve",
  });
  await transitionSupplierInvoice({
    id: invoice._id,
    target: "posted",
    actor: manager,
    settings: policy,
    idempotencyKey: "inv-post",
  });
  assert.equal(
    await PurchasePriceHistory.countDocuments({
      invoice: invoice._id,
      priceType: "invoiced",
    }),
    1
  );
  await assert.rejects(
    updateSupplierInvoice(invoice._id, invoicePayload, manager, policy),
    /Only draft or review-required/
  );
  const prices = await getPriceHistoryReport({ item: item._id });
  assert.equal(prices.summaries[0].source, "posted_invoice_actual");
  assert.equal(prices.summaries[0].lastPrice, 10);
  const mismatch = await createSupplierInvoice(
    {
      ...invoicePayload,
      supplierInvoiceNumber: "INV-002",
      items: [{ ...invoicePayload.items[0], quantity: 11, unitPrice: 120 }],
    },
    manager,
    policy
  );
  const review = await transitionSupplierInvoice({
    id: mismatch._id,
    target: "submitted",
    actor: manager,
    settings: policy,
    idempotencyKey: "inv2-submit",
  });
  assert.equal(review.invoice.status, "review_required");
  await assert.rejects(
    transitionSupplierInvoice({
      id: mismatch._id,
      target: "approved",
      actor: buyer,
      settings: policy,
    }),
    /Manager or Admin/
  );
  await assert.rejects(
    transitionSupplierInvoice({
      id: mismatch._id,
      target: "approved",
      actor: manager,
      settings: policy,
    }),
    /override reason/
  );

  const firstPayment = await recordSupplierPayment({
    invoiceId: invoice._id,
    payload: { amount: 400, method: "bank_transfer", idempotencyKey: "pay-1" },
    actor: manager,
    settings: policy,
  });
  assert.equal(firstPayment.invoice.paymentStatus, "partially_paid");
  const paymentRetry = await recordSupplierPayment({
    invoiceId: invoice._id,
    payload: { amount: 400, method: "bank_transfer", idempotencyKey: "pay-1" },
    actor: manager,
    settings: policy,
  });
  assert.equal(paymentRetry.duplicate, true);
  const concurrent = await Promise.allSettled([
    recordSupplierPayment({
      invoiceId: invoice._id,
      payload: { amount: 700, method: "cash", idempotencyKey: "pay-over-a" },
      actor: manager,
      settings: policy,
    }),
    recordSupplierPayment({
      invoiceId: invoice._id,
      payload: { amount: 600, method: "cash", idempotencyKey: "pay-final" },
      actor: manager,
      settings: policy,
    }),
  ]);
  assert.equal(
    concurrent.filter((row) => row.status === "fulfilled").length,
    1
  );
  const paidInvoice = await SupplierInvoice.findById(invoice._id);
  assert.equal(paidInvoice.paymentStatus, "paid");
  assert.equal(paidInvoice.paidAmountHalala, 100000);
  const finalPayment = await SupplierPayment.findOne({
    idempotencyKey: "pay-final",
  });
  await reverseSupplierPayment({
    paymentId: finalPayment._id,
    actor: admin,
    reason: "Bank transfer rejected",
  });
  assert.equal(
    (await SupplierInvoice.findById(invoice._id)).paymentStatus,
    "partially_paid"
  );

  const highPo = await createPurchaseOrder(
    {
      supplier: supplier._id,
      items: [{ item: item._id, quantity: 20, unitCost: 100 }],
      tax: 0,
    },
    admin,
    policy
  );
  await transitionPurchaseOrder({
    id: highPo._id,
    target: "submitted",
    actor: admin,
    settings: policy,
  });
  await assert.rejects(
    transitionPurchaseOrder({
      id: highPo._id,
      target: "approved",
      actor: manager,
      settings: policy,
    }),
    /Admin approval/
  );
  await assert.rejects(
    transitionPurchaseOrder({
      id: highPo._id,
      target: "approved",
      actor: admin,
      settings: policy,
    }),
    /emergency override/
  );
  await transitionPurchaseOrder({
    id: highPo._id,
    target: "approved",
    actor: admin,
    settings: policy,
    emergencyOverride: true,
    reason: "Urgent supply continuity",
  });
  const beforeRevision = (await PurchaseOrder.findById(highPo._id)).revision;
  await updatePurchaseOrder(
    highPo,
    { notes: "Non material note" },
    admin,
    policy
  );
  assert.equal((await PurchaseOrder.findById(highPo._id)).status, "approved");
  await updatePurchaseOrder(
    highPo,
    { items: [{ item: item._id, quantity: 21, unitCost: 100 }] },
    admin,
    policy
  );
  const revised = await PurchaseOrder.findById(highPo._id);
  assert.equal(revised.status, "draft");
  assert.equal(revised.revision, beforeRevision + 1);
  assert.ok(
    (await AuditLog.countDocuments({
      entityType: {
        $in: ["PurchaseOrder", "SupplierInvoice", "SupplierPayment"],
      },
    })) >= 10
  );
  console.log("Phase 3A purchasing integration checks passed");
};

try {
  await run();
} finally {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
}
