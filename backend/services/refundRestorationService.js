import StockTransaction from "../models/StockTransaction.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import { performStockMovement, runInventoryTransaction } from "./inventoryStockService.js";
import { creditOrderPoints } from "./rewardService.js";
import { calculateOrderPoints } from "../config/rewards.js";
import { ValidationError } from "../utils/inventoryValidation.js";

const round = value => Number(Number(value).toFixed(6));
// Historical deductions retain recipe component snapshots. Resolve their shares
// from the order snapshot, never from today's editable recipe.
const historicLineQuantities = (deduction, order) => {
  const quantities = order.items.map(() => 0);
  for (const component of deduction.sourceDetails?.components || []) {
    const weights = order.items.map(line => component.type === "add_on_recipe"
      ? line.quantity * (line.selectedAddOns || []).filter(add => String(add.addOn) === String(component.addOn)).reduce((sum, add) => sum + Number(add.quantity || 1), 0)
      : line.productType === "combo" ? line.quantity * (line.comboItems || []).filter(item => String(item.menuItem) === String(component.menuItem)).reduce((sum, item) => sum + item.quantity, 0)
        : String(line.menuItem) === String(component.menuItem) ? line.quantity : 0);
    const total = weights.reduce((sum, value) => sum + value, 0);
    if (total) weights.forEach((weight, index) => { quantities[index] += Number(component.ingredientQuantity || 0) * weight / total; });
  }
  return quantities.map((quantity, index) => ({ index, quantity }));
};
export const restoreRefundItems = async ({ order, items, actor, reference, session }) => {
  if (order.inventoryStatus === "restored") throw new ValidationError("Order inventory was already restored");
  const deductions = await StockTransaction.find({ _id: { $in: order.inventoryTransactions }, order: order._id, movementType: "STOCK_OUT" }).session(session).lean();
  const transactions = [];
  for (const deduction of deductions) {
    const shares = deduction.sourceDetails?.lineQuantities || historicLineQuantities(deduction, order);
    const quantity = round(items.reduce((sum, row) => sum + (shares.find(share => share.index === row.index)?.quantity || 0) * row.quantity / order.items[row.index].quantity, 0));
    if (!quantity) {
      if (!shares.some(row => row.quantity > 0)) throw new ValidationError("Historical ingredient allocations are incomplete; inventory cannot be safely restored");
      continue;
    }
    const previous = Number(order.inventoryReturnedQuantities?.[String(deduction._id)] || 0);
    if (round(previous + quantity) > deduction.quantity) throw new ValidationError("Inventory return exceeds the original deduction");
    let skip = previous; let remaining = quantity;
    const allocations = [];
    for (const allocation of deduction.batchAllocations || []) {
      const skipped = Math.min(skip, allocation.quantity); skip = round(skip - skipped);
      const taken = Math.min(remaining, round(allocation.quantity - skipped));
      if (taken > 0) allocations.push({ ...allocation, quantity: taken });
      remaining = round(remaining - taken);
    }
    const movement = await performStockMovement({ itemId: deduction.item, movementType: "STOCK_IN", quantity, reason: `Order #${order.orderNumber} returned inventory`, reference: `${order.orderNumber}-RETURN`, order: order._id, userId: actor._id, restoreAllocations: allocations, sourceDetails: { refundReference: reference, originalDeduction: deduction._id, items } }, { session });
    transactions.push(movement.transaction._id);
    order.inventoryReturnedQuantities = { ...order.inventoryReturnedQuantities, [String(deduction._id)]: round(previous + quantity) };
  }
  for (const row of items) {
    const restored = Number(order.restoredItemQuantities?.[row.index] || 0) + row.quantity;
    if (restored > order.items[row.index].quantity) throw new ValidationError("This item quantity was already restored");
    order.restoredItemQuantities = { ...order.restoredItemQuantities, [row.index]: restored };
  }
  order.inventoryRestorationTransactions.push(...transactions);
  if (order.items.every((line, index) => Number(order.restoredItemQuantities[index] || 0) >= line.quantity)) {
    order.inventoryStatus = deductions.length ? "restored" : "not_required";
    order.inventoryRestoredAt = new Date();
  }
  return transactions;
};

export const reverseRefundRewards = async ({ order, refundedHalala, reference, session }) => {
  if (!order.user || order.pointsReversedAt || !order.pointsEarned) return;
  const target = Math.min(order.pointsEarned, Math.floor(order.pointsEarned * refundedHalala / Math.round(order.totalAmount * 100)));
  const entitlement = Math.max(0, target - Number(order.rewardRefundPointsReversed || 0));
  const user = await User.findById(order.user).session(session);
  if (!user) return;
  const key = `POS_REFUND_REWARD:${reference}`;
  if (user.pointTransactions.some(row => row.sourceKey === key || row.sourceKey === `ORDER_REVERSAL:${order._id}`)) return;
  const reversed = Math.min(Number(user.pointsBalance || 0), entitlement);
  if (entitlement > 0) {
    user.pointsBalance = Math.max(0, Number(user.pointsBalance || 0) - reversed);
    user.pointsDebt = Number(user.pointsDebt || 0) + entitlement - reversed;
    user.pointTransactions.push({ type: "REVERSAL", points: -entitlement, order: order._id, description: `Refund points for Order #${order.orderNumber}`, balanceAfter: user.pointsBalance, sourceKey: key });
    await user.save(session ? { session } : {});
  }
  order.rewardRefundPointsReversed = target;
  if (target === order.pointsEarned) order.pointsReversedAt = new Date();
};

// Awarding happens after sale completion (preserving the existing warning flow),
// but shares a transaction with the order so a concurrent refund cannot leave
// late-earned points unreversed.
export const creditPosSaleRewards = orderId => runInventoryTransaction(async session => {
  const order = await Order.findById(orderId).session(session);
  if (order?.rewardAccrualPolicy === "completion" && order.status !== "delivered") return order;
  if (!order?.user || order.source !== "pos" || order.pointsAwardedAt || order.totalAmount <= 0 || !["paid", "partially_refunded"].includes(order.paymentStatus)) return order;
  const points = calculateOrderPoints(order.totalAmount);
  const credited = await creditOrderPoints({ userId: order.user, orderId, orderNumber: order.orderNumber, points, session });
  if (credited || points === 0) {
    order.pointsEarned = points;
    order.pointsAwardedAt = points ? new Date() : null;
    if (order.refundedAmountHalala > 0) await reverseRefundRewards({ order, refundedHalala: order.refundedAmountHalala, reference: `late-award:${orderId}`, session });
    await order.save(session ? { session } : {});
  }
  return order;
});
