import mongoose from "mongoose";

const actorSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, required: true, trim: true, maxlength: 40 },
  },
  { _id: false }
);

const customerNoteSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      index: true,
    },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    createdBySnapshot: { type: actorSnapshotSchema, required: true, immutable: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBySnapshot: { type: actorSnapshotSchema, default: null },
  },
  { timestamps: true }
);

customerNoteSchema.index({ customer: 1, createdAt: -1 });

export default mongoose.model("CustomerNote", customerNoteSchema);
