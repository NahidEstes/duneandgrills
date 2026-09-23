import mongoose from "mongoose";

const expenseCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: "", trim: true, maxlength: 300 },
    color: { type: String, default: "#f59e0b", trim: true, maxlength: 20 },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

expenseCategorySchema.index(
  { name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

export default mongoose.model("ExpenseCategory", expenseCategorySchema);
