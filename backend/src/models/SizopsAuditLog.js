import mongoose from 'mongoose';

/**
 * Audit trail for SizOps SSO identity events. Records WHO and WHAT happened
 * without ever storing credentials: no passwords, client secrets, access
 * tokens, refresh tokens or full ID tokens.
 */
const sizopsAuditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    action: {
      type: String,
      enum: ['sizops.login', 'sizops.link', 'sizops.unlink', 'sizops.login_failed', 'sizops.oauth_error'],
      required: true,
    },
    // Non-sensitive context (client id, masked sizops user id, failure reason).
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true },
);

sizopsAuditLogSchema.index({ userId: 1, createdAt: -1 });
sizopsAuditLogSchema.index({ action: 1, createdAt: -1 });
sizopsAuditLogSchema.index({ createdAt: -1 });

export default mongoose.model('SizopsAuditLog', sizopsAuditLogSchema);
