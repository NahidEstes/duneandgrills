import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 30 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    contactName: { type: String, default: "", trim: true, maxlength: 100 },
    email: { type: String, default: "", trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, default: "", trim: true, maxlength: 40 },
    address: { type: String, default: "", trim: true, maxlength: 300 },
    taxNumber: { type: String, default: "", trim: true, maxlength: 40 },
    paymentTerms: { type: String, default: "", trim: true, maxlength: 120 },
    notes: { type: String, default: "", trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true },
    externalId: { type: String, default: null, trim: true, sparse: true },
  },
  { timestamps: true }
);

supplierSchema.index({ name: 1 }, { collation: { locale: "en", strength: 2 } });

export default mongoose.model("Supplier", supplierSchema);
