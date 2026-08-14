import mongoose from 'mongoose';

const sizopsOutboxSchema = new mongoose.Schema(
  {
    sizopsUserId: { type: String, required: true },
    event: { type: String, enum: ['disconnect'], default: 'disconnect' },
    status: { type: String, enum: ['pending', 'done', 'failed'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 10 },
    nextAttemptAt: { type: Date, default: () => new Date() },
    lastError: { type: String, default: '' },
    lastAttemptAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

sizopsOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
sizopsOutboxSchema.index({ sizopsUserId: 1, event: 1, status: 1 });

export default mongoose.model('SizopsOutbox', sizopsOutboxSchema);
