import mongoose from "mongoose";

const id = mongoose.Schema.Types.ObjectId;
const ruleSchema = new mongoose.Schema({
  item: { type: id, ref: "InventoryItem", required: true, unique: true, immutable: true },
  enabled: { type: Boolean, default: false },
  lowEnabled: { type: Boolean, default: true }, outEnabled: { type: Boolean, default: true },
  threshold: { type: Number, required: true, min: 0 }, baseUnit: { type: String, required: true },
  enteredThreshold: { type: Number, required: true, min: 0 }, enteredUnit: { type: String, required: true },
  mode: { type: String, enum: ["repeat", "daily"], default: "repeat" },
  repeatMinutes: { type: Number, default: 30 }, dailyTime: { type: String, default: "10:00" },
  recipients: [{ type: id, ref: "User" }], version: { type: Number, default: 1 },
  incident: { type: String, default: null }, severity: { type: String, default: null },
  incidentStartedAt: Date, lastDailyDay: String, sequence: { type: Number, default: 0 },
  lastCheckedAt: Date, lastEventAt: Date, nextEvaluationAt: { type: Date, default: Date.now, index: true },
  leaseUntil: Date, lease: String, lockVersion: { type: Number, default: 0 },
  updatedBy: { type: id, ref: "User", required: true },
}, { timestamps: true });
ruleSchema.index({ enabled: 1, nextEvaluationAt: 1, leaseUntil: 1 });

const receiptSchema = new mongoose.Schema({
  rule: { type: id, ref: "StockAlertRule", required: true }, incident: { type: String, required: true },
  user: { type: id, ref: "User", required: true }, snoozedUntil: Date,
  nextReminderAt: Date, lastSentAt: Date, lastSeverity: String, lastSequence: Number,
}, { timestamps: true });
receiptSchema.index({ rule: 1, incident: 1, user: 1 }, { unique: true });

const noteSchema = new mongoose.Schema({
  rule: { type: id, ref: "StockAlertRule", required: true }, ruleVersion: Number,
  incident: { type: String, required: true }, sequence: { type: Number, required: true },
  user: { type: id, ref: "User", required: true }, severity: String,
  title: String, body: String, quantity: Number, threshold: Number, unit: String,
  status: { type: String, enum: ["active", "resolved", "cancelled"], default: "active" },
  readAt: Date, dismissedAt: Date,
}, { timestamps: true });
noteSchema.index({ rule: 1, incident: 1, sequence: 1, user: 1 }, { unique: true });
noteSchema.index({ user: 1, createdAt: -1 });

const pushSchema = new mongoose.Schema({
  user: { type: id, ref: "User", required: true }, sessionVersion: Number,
  endpoint: { type: String, required: true, select: false }, endpointHash: { type: String, required: true, unique: true },
  keys: { p256dh: { type: String, select: false }, auth: { type: String, select: false } },
  deviceHash: { type: String, required: true, index: true, select: false }, enabled: { type: Boolean, default: true },
}, { timestamps: true });
pushSchema.index({ user: 1, enabled: 1 });

const deliverySchema = new mongoose.Schema({
  notification: { type: id, ref: "StockAlertNotification", required: true },
  subscription: { type: id, ref: "StockAlertPush", required: true },
  status: { type: String, enum: ["pending", "sent", "cancelled", "failed"], default: "pending" },
  attempts: { type: Number, default: 0 }, dueAt: { type: Date, default: Date.now },
  leaseUntil: Date, lease: String, acceptedAt: Date,
}, { timestamps: true });
deliverySchema.index({ notification: 1, subscription: 1 }, { unique: true });
deliverySchema.index({ status: 1, dueAt: 1, leaseUntil: 1 });

const jobSchema = new mongoose.Schema({
  _id: { type: String, default: "stock-alerts" }, lastStartedAt: Date, lastCompletedAt: Date,
  lastFailedAt: Date, lastFailure: String,
});
export const StockAlertRule = mongoose.model("StockAlertRule", ruleSchema);
export const StockAlertReceipt = mongoose.model("StockAlertReceipt", receiptSchema);
export const StockAlertNotification = mongoose.model("StockAlertNotification", noteSchema);
export const StockAlertPush = mongoose.model("StockAlertPush", pushSchema);
export const StockAlertDelivery = mongoose.model("StockAlertDelivery", deliverySchema);
export const StockAlertJob = mongoose.model("StockAlertJob", jobSchema);
export const stockAlertModels = [StockAlertRule, StockAlertReceipt, StockAlertNotification, StockAlertPush, StockAlertDelivery, StockAlertJob];
