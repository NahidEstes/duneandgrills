import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
    actorName: { type: String, default: "System", trim: true, immutable: true },
    actorRole: { type: String, default: "system", trim: true, immutable: true },
    action: { type: String, required: true, trim: true, uppercase: true, immutable: true },
    entityType: { type: String, required: true, trim: true, immutable: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
    entityLabel: { type: String, default: "", trim: true, immutable: true },
    correlationId: { type: String, default: "", trim: true, maxlength: 100, immutable: true },
    reason: { type: String, default: "", trim: true, maxlength: 500, immutable: true },
    related: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true },
    changedFields: { type: [String], default: [], immutable: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
    after: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ correlationId: 1 }, { sparse: true });
auditLogSchema.index({ entityLabel: "text", action: "text", entityType: "text" });

auditLogSchema.pre("save", function () { if (!this.isNew) throw new Error("Audit history is append-only"); });
auditLogSchema.pre("deleteOne", { document: true, query: false }, function () { throw new Error("Audit history is append-only"); });
auditLogSchema.pre("updateOne", { document: true, query: false }, function () { throw new Error("Audit history is append-only"); });
auditLogSchema.pre("bulkWrite", function (next, operations) {
  if (operations.some(operation => !operation.insertOne)) return next(new Error("Audit history is append-only"));
  next();
});
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"]) {
  auditLogSchema.pre(operation, function () { throw new Error("Audit history is append-only"); });
}
export default mongoose.model("AuditLog", auditLogSchema);
