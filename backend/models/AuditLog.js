const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorId: String,
  actorUsername: String,
  actorName: String,
  actorRole: String,
  department: String,
  action: { type: String, required: true, index: true },
  entityType: String,
  entityId: String,
  status: { type: String, enum: ['success', 'failure'], default: 'success', index: true },
  message: String,
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipAddress: String,
  userAgent: String,
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1, action: 1 });
auditLogSchema.index({ actorUsername: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
