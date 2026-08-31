import mongoose from 'mongoose';

const adminAuditLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    adminUsername: { type: String, default: '' },
    action: {
      type: String,
      enum: [
        'user_balance_changed',
        'user_banned',
        'user_unbanned',
        'user_role_changed',
        'user_level_changed',
        'user_created_at_changed',
        'user_username_changed',
        'user_restored',
        'user_permanently_deleted',
        'maintenance_enabled',
        'maintenance_disabled',
        'season_ended',
        'tick_run',
      ],
      required: true,
    },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    targetUsername: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

adminAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });
adminAuditLogSchema.index({ adminId: 1, createdAt: -1 });
adminAuditLogSchema.index({ createdAt: -1 });

export default mongoose.model('AdminAuditLog', adminAuditLogSchema);
