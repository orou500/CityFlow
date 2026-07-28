import mongoose from 'mongoose';

const missionProgressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    missionId: { type: String, required: true },
    status: {
      type: String,
      enum: ['active', 'completed', 'claimed'],
      default: 'active',
    },
    progress: { type: Number, default: 0 },
    target: { type: Number, required: true },
    completedAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
    periodKey: { type: String, default: null },
    startedAt: { type: Date, default: Date.now },
    rewardsClaimed: {
      xp: { type: Number, default: 0 },
      balance: { type: Number, default: 0 },
      badge: { type: String, default: null },
      title: { type: String, default: null },
    },
  },
  { timestamps: true },
);

missionProgressSchema.index({ userId: 1, missionId: 1 }, { unique: true });
missionProgressSchema.index({ userId: 1, status: 1 });
missionProgressSchema.index({ userId: 1, periodKey: 1 });
missionProgressSchema.index({ status: 1, completedAt: 1 });

export default mongoose.model('MissionProgress', missionProgressSchema);
