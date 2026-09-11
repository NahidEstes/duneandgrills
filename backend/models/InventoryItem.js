import mongoose from "mongoose";

export const INVENTORY_UNITS = ["kg", "g", "L", "ml", "pcs", "box", "pack", "bottle", "can", "tray"];
export const PURCHASE_UNITS = [...new Set([...INVENTORY_UNITS, "carton", "case", "bag", "sack"])];

const inventoryItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 50 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryCategory", required: true },
    unit: { type: String, required: true, enum: INVENTORY_UNITS },
    purchaseUnit: { type: String, enum: PURCHASE_UNITS, default: null },
    purchaseConversionFactor: { type: Number, default: 1, min: 0.000001 },
    currentStock: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", default: null },
    tracksExpiry: { type: Boolean, default: false },
    expiryDate: { type: Date, default: null },
    storageLocation: { type: String, default: "", trim: true, maxlength: 120 },
    isActive: { type: Boolean, default: true },
    allowNegativeStock: { type: Boolean, default: false },
    externalId: { type: String, default: null, trim: true, sparse: true },
    menuItems: [{ type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" }],
  },
  { timestamps: true, optimisticConcurrency: true }
);

inventoryItemSchema.index({ name: "text", sku: "text", storageLocation: "text" });
inventoryItemSchema.index({ category: 1, supplier: 1, isActive: 1 });
inventoryItemSchema.index({ currentStock: 1, reorderLevel: 1 });
inventoryItemSchema.index({ expiryDate: 1 }, { sparse: true });

export default mongoose.model("InventoryItem", inventoryItemSchema);
