import CashMovement from "../models/CashMovement.js";
import Order from "../models/Order.js";
import PosShift from "../models/PosShift.js";
import Refund from "../models/Refund.js";
import { fromHalala, positiveHalala, toHalala } from "../utils/money.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { recordAuditLog } from "./auditLogService.js";
import { runInventoryTransaction } from "./inventoryStockService.js";

const sessionOptions = (session) => session ? { session } : {};
const terminalCode = (value) => String(value || "MAIN").trim().toUpperCase().slice(0, 60) || "MAIN";
const cashDirection = (type, payloadDirection) => type === "correction" ? payloadDirection : ["cash_out", "payout", "cash_refund"].includes(type) ? "out" : "in";

export const calculateExpectedCashHalala = (movements = []) => movements.reduce((total, movement) => {
  const amount = Number(movement.amountHalala || 0);
  return total + (movement.direction === "out" ? -amount : amount);
}, 0);

const createMovement = async ({ shift, type, amountHalala, reason, actor, order = null, refund = null, idempotencyKey = null, direction = null }, session) => {
  const prior = idempotencyKey ? await CashMovement.findOne({ idempotencyKey }).session(session || null) : null;
  if (prior) return prior;
  const [movement] = await CashMovement.create([{
    shift: shift._id,
    type,
    amountHalala,
    direction: cashDirection(type, direction),
    reason,
    order,
    refund,
    createdBy: actor._id || actor,
    idempotencyKey,
  }], sessionOptions(session));
  return movement;
};

export const findOpenShift = ({ cashier, terminal = null }, session = null) => {
  const filter = { cashier, isOpen: true };
  if (terminal) filter.terminal = terminalCode(terminal);
  return PosShift.findOne(filter).session(session || null);
};

export const openPosShift = async ({ actor, openingCash, terminal, correlationId }) => {
  const openingCashHalala = toHalala(openingCash || 0, "Opening cash");
  const normalizedTerminal = terminalCode(terminal);
  return runInventoryTransaction(async (session) => {
    const existing = await findOpenShift({ cashier: actor._id, terminal: normalizedTerminal }, session);
    if (existing) throw new ValidationError(`An open shift already exists on ${normalizedTerminal}`);
    let shift;
    try {
      [shift] = await PosShift.create([{
        cashier: actor._id,
        terminal: normalizedTerminal,
        openingCashHalala,
        openedBy: actor._id,
        status: "open",
        isOpen: true,
      }], sessionOptions(session));
    } catch (error) {
      if (error?.code === 11000) throw new ValidationError(`An open shift already exists on ${normalizedTerminal}`);
      throw error;
    }
    if (openingCashHalala > 0) await createMovement({ shift, type: "opening_cash", amountHalala: openingCashHalala, reason: "Opening cash", actor, idempotencyKey: `shift:${shift._id}:opening` }, session);
    await recordAuditLog({ actor, action: "POS_SHIFT_OPENED", entityType: "PosShift", entityId: shift._id, entityLabel: `${normalizedTerminal} · ${actor.name}`, correlationId, after: { terminal: normalizedTerminal, openingCash: fromHalala(openingCashHalala), status: shift.status } }, { session });
    return shift;
  });
};

export const recordPosCashSale = async ({ shift, order, actor, session }) => {
  if (!shift || order.paymentMethod !== "cash") return null;
  return createMovement({ shift, type: "cash_sale", amountHalala: toHalala(order.totalAmount), reason: `POS sale #${order.orderNumber}`, actor, order: order._id, idempotencyKey: `pos-sale:${order._id}` }, session);
};

export const recordRefundCashMovement = async ({ refund, order, actor, session }) => {
  if (!order.posShift || refund.method !== "cash") return null;
  let shift = await PosShift.findOne({ _id: order.posShift, isOpen: true }).session(session || null);
  // Never mutate a closed shift. A later cash refund belongs to the actor's
  // currently open drawer; reports still retain the original order relation.
  if (!shift) shift = await findOpenShift({ cashier: actor._id }, session);
  if (!shift) throw new ValidationError("Open a POS shift before completing this cash refund");
  return createMovement({ shift, type: "cash_refund", amountHalala: refund.amountHalala, reason: `Refund for order #${order.orderNumber}`, actor, order: order._id, refund: refund._id, idempotencyKey: `cash-refund:${refund._id}` }, session);
};

export const addCashMovement = async ({ shiftId, type, amount, reason, direction, actor, correlationId }) => {
  if (!["cash_in", "cash_out", "payout", "correction"].includes(type)) throw new ValidationError("Invalid manual cash movement type");
  const normalizedReason = String(reason || "").trim();
  if (!normalizedReason) throw new ValidationError("A reason is required");
  const amountHalala = positiveHalala(amount, "Cash movement amount");
  return runInventoryTransaction(async (session) => {
    const shift = await PosShift.findOne({ _id: shiftId, isOpen: true }).session(session || null);
    if (!shift) throw new ValidationError("Open shift was not found");
    if (String(shift.cashier) !== String(actor._id) && !["admin", "manager"].includes(actor.role)) throw new ValidationError("You cannot change another cashier's shift");
    if (type === "correction" && !["admin", "manager"].includes(actor.role)) throw new ValidationError("Only a manager can post cash corrections");
    if (type === "correction" && !["in", "out"].includes(direction)) throw new ValidationError("Correction direction must be in or out");
    const movement = await createMovement({ shift, type, amountHalala, reason: normalizedReason, direction, actor }, session);
    await recordAuditLog({ actor, action: "POS_CASH_MOVEMENT", entityType: "CashMovement", entityId: movement._id, entityLabel: `${shift.terminal} · ${type}`, correlationId, after: { type, amount: fromHalala(amountHalala), direction: movement.direction }, reason: normalizedReason, related: { shift: shift._id } }, { session });
    return movement;
  });
};

export const summarizePosShift = async (shift, { includeExpected = true, session = null } = {}) => {
  const [movements, orders] = await Promise.all([
    CashMovement.find({ shift: shift._id }).sort({ createdAt: 1 }).session(session || null).lean(),
    Order.find({ posShift: shift._id, paymentStatus: { $in: ["paid", "partially_refunded", "refunded"] } }).select("totalAmount paymentMethod orderNumber").session(session || null).lean(),
  ]);
  const orderIds = orders.map((order) => order._id);
  const refunds = orderIds.length ? await Refund.find({ order: { $in: orderIds }, status: "completed" }).select("amountHalala method order").session(session || null).lean() : [];
  const sales = (method) => toHalala(orders.filter((order) => order.paymentMethod === method).reduce((sum, order) => sum + Number(order.totalAmount || 0), 0));
  const refundTotal = (method) => refunds.filter((refund) => refund.method === method).reduce((sum, refund) => sum + Number(refund.amountHalala || 0), 0);
  const drawerCashRefundsHalala = movements
    .filter((movement) => movement.type === "cash_refund")
    .reduce((sum, movement) => sum + Number(movement.amountHalala || 0), 0);
  const expectedCashHalala = calculateExpectedCashHalala(movements);
  const cashInHalala = movements.filter((row) => ["cash_in", "correction"].includes(row.type) && row.direction === "in").reduce((sum, row) => sum + row.amountHalala, 0);
  const cashOutHalala = movements.filter((row) => ["cash_out", "payout", "correction"].includes(row.type) && row.direction === "out").reduce((sum, row) => sum + row.amountHalala, 0);
  return {
    shift,
    totals: {
      openingCash: fromHalala(shift.openingCashHalala),
      cashSales: fromHalala(sales("cash")),
      cardSales: fromHalala(sales("card")),
      otherSales: fromHalala(sales("other")),
      // Cash refunds belong to the drawer that physically paid them out,
      // which may differ from the original sale's already-closed shift.
      cashRefunds: fromHalala(drawerCashRefundsHalala),
      cardRefunds: fromHalala(refundTotal("card")),
      cashAdded: fromHalala(cashInHalala),
      cashPayouts: fromHalala(cashOutHalala),
      ...(includeExpected ? { expectedCash: fromHalala(expectedCashHalala) } : {}),
    },
    movementCount: movements.length,
    orderCount: orders.length,
    movements,
  };
};

export const closePosShift = async ({ shiftId, countedCash, note, idempotencyKey, actor, settings, correlationId }) => {
  const countedCashHalala = toHalala(countedCash, "Counted cash");
  const key = String(idempotencyKey || "").trim();
  if (!key) throw new ValidationError("Shift close request identifier is required");
  const duplicate = await PosShift.findOne({ closeIdempotencyKey: key });
  if (duplicate) return { shift: duplicate, duplicate: true };
  return runInventoryTransaction(async (session) => {
    const shift = await PosShift.findOne({ _id: shiftId, isOpen: true }).session(session || null);
    if (!shift) throw new ValidationError("Open shift was not found");
    if (String(shift.cashier) !== String(actor._id) && !["admin", "manager"].includes(actor.role)) throw new ValidationError("You cannot close another cashier's shift");
    const summary = await summarizePosShift(shift, { includeExpected: true, session });
    const expectedCashHalala = toHalala(summary.totals.expectedCash);
    const differenceHalala = countedCashHalala - expectedCashHalala;
    const normalizedNote = String(note || "").trim();
    const threshold = toHalala(settings.varianceThreshold || 0);
    if (Math.abs(differenceHalala) > threshold && !normalizedNote) throw new ValidationError("Explain the cash difference before closing this shift");
    shift.status = "closed";
    shift.isOpen = false;
    shift.expectedCashHalala = expectedCashHalala;
    shift.countedCashHalala = countedCashHalala;
    shift.differenceHalala = differenceHalala;
    shift.closingNote = normalizedNote;
    shift.closedAt = new Date();
    shift.closedBy = actor._id;
    shift.closeIdempotencyKey = key;
    shift.cashSalesHalala = toHalala(summary.totals.cashSales);
    shift.cardSalesHalala = toHalala(summary.totals.cardSales);
    shift.otherSalesHalala = toHalala(summary.totals.otherSales);
    shift.cashRefundsHalala = toHalala(summary.totals.cashRefunds);
    shift.cardRefundsHalala = toHalala(summary.totals.cardRefunds);
    shift.cashAddedHalala = toHalala(summary.totals.cashAdded);
    shift.cashPayoutsHalala = toHalala(summary.totals.cashPayouts);
    if (["admin", "manager"].includes(actor.role) && Math.abs(differenceHalala) > threshold) shift.managerApprovedBy = actor._id;
    await shift.save(sessionOptions(session));
    await recordAuditLog({ actor, action: "POS_SHIFT_CLOSED", entityType: "PosShift", entityId: shift._id, entityLabel: `${shift.terminal} · ${actor.name}`, correlationId, before: { status: "open" }, after: { status: "closed", expectedCash: fromHalala(expectedCashHalala), countedCash: fromHalala(countedCashHalala), difference: fromHalala(differenceHalala) }, reason: normalizedNote }, { session });
    return { shift, duplicate: false };
  });
};

export const reopenPosShift = async ({ shiftId, reason, actor, correlationId }) => {
  const normalizedReason = String(reason || "").trim();
  if (!normalizedReason) throw new ValidationError("Reopen reason is required");
  return runInventoryTransaction(async (session) => {
    const shift = await PosShift.findOne({ _id: shiftId, isOpen: false, status: "closed" }).session(session || null);
    if (!shift) throw new ValidationError("Closed shift was not found");
    const conflict = await findOpenShift({ cashier: shift.cashier, terminal: shift.terminal }, session);
    if (conflict) throw new ValidationError("Another shift is already open for this cashier and terminal");
    shift.status = "reopened";
    shift.isOpen = true;
    shift.reopenReason = normalizedReason;
    shift.closeIdempotencyKey = null;
    await shift.save(sessionOptions(session));
    await recordAuditLog({ actor, action: "POS_SHIFT_REOPENED", entityType: "PosShift", entityId: shift._id, entityLabel: shift.terminal, correlationId, before: { status: "closed" }, after: { status: "reopened" }, reason: normalizedReason }, { session });
    return shift;
  });
};
