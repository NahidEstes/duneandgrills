import { startOfRiyadhDay, ADMIN_DAY_MS } from "../utils/adminDate.js";

export const CASH_LABELS = Object.freeze({
  collection_pending: "Customer collection pending", awaiting_confirmation: "Rider reported — cashier confirmation pending",
  discrepancy: "Shortage/discrepancy", confirmed: "Cash confirmed", no_collection: "No collection needed", unavailable: "Unavailable / requires review",
});
export const ATTENTION_KEYS = Object.freeze(["ready_unassigned", "pickup_delayed", "delivery_delayed", "issue", "no_cash_report", "awaiting_cash", "discrepancy", "timing_unavailable"]);
const threshold = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 1440) throw new Error(`${name} must be an integer from 1 to 1440 minutes`);
  return value;
};
export const deliveryDelayThresholds = () => ({ pickupMinutes: threshold("DELIVERY_PICKUP_DELAY_MINUTES", 15), deliveryMinutes: threshold("DELIVERY_TRANSIT_DELAY_MINUTES", 45) });

// Display classification only. It never creates a payment, settlement or new debt.
export function deliveryCashFacts(delivery, balance, eligible) {
  const cash = delivery.cashReport || {}, status = cash.status || "none";
  const reported = ["unconfirmed", "discrepancy", "confirmed"].includes(status);
  const validReport = Number.isSafeInteger(cash.amountHalala) && cash.amountHalala >= 0;
  const state = !eligible || balance === null || (reported && !validReport) || !["none", "unconfirmed", "discrepancy", "confirmed"].includes(status) ? "unavailable"
    : status === "confirmed" ? "confirmed" : status === "discrepancy" ? "discrepancy" : status === "unconfirmed" ? "awaiting_confirmation"
      : balance > 0 ? "collection_pending" : "no_collection";
  return { cashState: state, cashLabel: CASH_LABELS[state], ledgerOutstandingHalala: balance,
    customerCollectionHalala: state === "collection_pending" ? balance : null,
    reportedCashHalala: reported && validReport ? cash.amountHalala : null };
}

const numeric = (value, maximum = Number.MAX_SAFE_INTEGER / 100) => ({ $and: [{ $isNumber: value }, { $gte: [value, 0] }, { $lte: [value, maximum] }] });
// Same nonnegative rounding as toHalala; validate operands before evaluating.
const halala = value => ({ $floor: { $add: [{ $multiply: [{ $add: [value, Number.EPSILON] }, 100] }, 0.5] } });
export function deliveryHealthPipeline(now = new Date()) {
  const thresholds = deliveryDelayThresholds(), today = startOfRiyadhDay(now), tomorrow = new Date(today.getTime() + ADMIN_DAY_MS);
  const order = "$orderRecord", report = { $ifNull: ["$cashReport.status", "none"] };
  const eligible = { $and: [
    { $eq: [`${order}.deliveryMode`, "restaurant"] }, { $eq: [`${order}.orderType`, "delivery"] }, { $in: [`${order}.source`, ["website", "phone", "pos"]] },
    { $not: [{ $ifNull: [`${order}.manualEntry`, false] }] }, { $not: [{ $ifNull: [`${order}.deliveryProvider`, false] }] }, { $ne: [`${order}.deliveryPaymentType`, "aggregator_prepaid"] },
    { $not: [{ $in: [`${order}.status`, ["cancelled", "failed", "refunded"]] }] }, { $not: [{ $in: [`${order}.paymentStatus`, ["voided", "failed"]] }] },
    { $ne: [`${order}.inventoryStatus`, "restored"] }, { $not: [{ $anyElementTrue: [{ $map: { input: { $objectToArray: { $ifNull: [`${order}.restoredItemQuantities`, {}] } }, as: "restored", in: { $gt: [{ $convert: { input: "$$restored.v", to: "double", onError: 0, onNull: 0 } }, 0] } } }] }] },
  ] };
  const records = { $ifNull: [`${order}.paymentRecords`, []] };
  const balance = { $cond: [numeric(`${order}.totalAmount`), { $switch: { branches: [
    { case: { $in: [`${order}.paymentStatus`, ["paid", "partially_refunded", "refunded"]] }, then: 0 },
    { case: { $and: [{ $in: [`${order}.paymentStatus`, ["pending", "unpaid"]] }, { $allElementsTrue: [{ $map: { input: records, as: "payment", in: numeric("$$payment.amount") } }] }] },
      then: { $max: [0, { $subtract: [halala(`${order}.totalAmount`), { $sum: { $map: { input: records, as: "payment", in: halala("$$payment.amount") } } }] }] } },
  ], default: null } }, null] };
  const validReport = { $and: [numeric("$cashReport.amountHalala", Number.MAX_SAFE_INTEGER), { $eq: ["$cashReport.amountHalala", { $trunc: { $convert: { input: "$cashReport.amountHalala", to: "double", onError: -1, onNull: -1 } } }] }] };
  const hasReport = { $in: [report, ["unconfirmed", "discrepancy", "confirmed"]] };
  const clock = { $cond: [{ $and: [{ $eq: [{ $type: "$assignedAt" }, "date"] }, { $eq: [{ $type: `${order}.readyAt` }, "date"] }] }, { $max: ["$assignedAt", `${order}.readyAt`] }, null] };
  return { thresholds, today, tomorrow, stages: [
    { $set: { healthEligible: eligible, healthBalance: balance, pickupClock: clock } },
    { $set: { healthCash: { $switch: { branches: [
      { case: { $or: [{ $not: ["$healthEligible"] }, { $eq: ["$healthBalance", null] }, { $and: [hasReport, { $not: [validReport] }] }, { $not: [{ $in: [report, ["none", "unconfirmed", "discrepancy", "confirmed"]] }] }] }, then: "unavailable" },
      { case: { $eq: [report, "confirmed"] }, then: "confirmed" }, { case: { $eq: [report, "discrepancy"] }, then: "discrepancy" },
      { case: { $eq: [report, "unconfirmed"] }, then: "awaiting_confirmation" }, { case: { $gt: ["$healthBalance", 0] }, then: "collection_pending" },
    ], default: "no_collection" } } } },
    { $set: { attentionFlags: {
      ready_unassigned: { $and: ["$healthEligible", { $eq: ["$status", "unassigned"] }, { $eq: [`${order}.status`, "ready"] }] },
      pickup_delayed: { $and: ["$healthEligible", { $eq: ["$status", "assigned"] }, { $eq: [`${order}.status`, "ready"] }, { $ne: ["$pickupClock", null] }, { $lte: ["$pickupClock", new Date(now.getTime() - thresholds.pickupMinutes * 60000)] }] },
      delivery_delayed: { $and: ["$healthEligible", { $eq: ["$status", "picked_up"] }, { $eq: [{ $type: "$pickedUpAt" }, "date"] }, { $lte: ["$pickedUpAt", new Date(now.getTime() - thresholds.deliveryMinutes * 60000)] }] },
      issue: { $and: ["$healthEligible", { $eq: ["$status", "issue"] }, { $eq: [{ $ifNull: ["$issue.resolvedAt", null] }, null] }] },
      no_cash_report: { $and: [{ $eq: ["$status", "delivered"] }, { $eq: ["$healthCash", "collection_pending"] }] },
      awaiting_cash: { $and: [{ $eq: ["$status", "delivered"] }, { $eq: ["$healthCash", "awaiting_confirmation"] }] },
      discrepancy: { $and: [{ $eq: ["$status", "delivered"] }, { $eq: ["$healthCash", "discrepancy"] }] },
      timing_unavailable: { $and: ["$healthEligible", { $or: [
        { $and: [{ $eq: ["$status", "assigned"] }, { $eq: [`${order}.status`, "ready"] }, { $eq: ["$pickupClock", null] }] },
        { $and: [{ $eq: ["$status", "picked_up"] }, { $ne: [{ $type: "$pickedUpAt" }, "date"] }] },
      ] }] },
    } } },
  ] };
}
