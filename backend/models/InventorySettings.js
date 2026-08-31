import mongoose from "mongoose";

const inventorySettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true, immutable: true },
    outletName: { type: String, default: "Dune & Grills — Main Outlet", trim: true, maxlength: 120 },
    currency: { type: String, enum: ["SAR"], default: "SAR", immutable: true },
    expiryAlertDays: { type: Number, default: 7, min: 1, max: 365 },
    defaultAllowNegativeStock: { type: Boolean, default: false },
    googleSheetsSync: {
      enabled: { type: Boolean, default: false, immutable: true },
      provider: { type: String, enum: ["google_sheets"], default: "google_sheets", immutable: true },
      lastSyncedAt: { type: Date, default: null },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("InventorySettings", inventorySettingsSchema);
