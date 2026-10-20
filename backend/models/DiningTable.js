import crypto from "node:crypto";
import mongoose from "mongoose";

const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 20, match: /^[A-Z0-9-]+$/ },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  isActive: { type: Boolean, default: true },
  qrToken: { type: String, required: true, select: false },
  qrTokenHash: { type: String, required: true, unique: true, select: false },
  orderCount: { type: Number, default: 0, select: false },
}, { timestamps: true });
schema.pre("validate", function () {
  if (this.isNew && !this.qrToken) {
    this.qrToken = crypto.randomBytes(32).toString("base64url");
    this.qrTokenHash = crypto.createHash("sha256").update(this.qrToken).digest("hex");
  }
});
export default mongoose.model("DiningTable", schema);
