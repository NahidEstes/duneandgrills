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
auditLogSchema.index({ entityLabel: "text", action: "text", entityType: "text" });

export default mongoose.model("AuditLog", auditLogSchema);
