import mongoose from 'mongoose';

const rewardedAdSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'completed', 'expired', 'aborted'],
      default: 'pending',
    },
    vastUrl: { type: String, required: true },
    rewardAmount: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    abortedAt: { type: Date, default: null },
    // Admin analytics counters. impressions is incremented once when the VAST
    // doc is served (a serve that reached the client); completionAttemptCount
    // on every completion POST; failedCompletionCount on server-side rejections
    // of a completion attempt for a still-pending session.
    impressions: { type: Number, default: 0, min: 0 },
    completionAttemptCount: { type: Number, default: 0, min: 0 },
    failedCompletionCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

rewardedAdSessionSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model('RewardedAdSession', rewardedAdSessionSchema);
