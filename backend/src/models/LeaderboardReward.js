import mongoose from 'mongoose';

const leaderboardRewardSchema = new mongoose.Schema(
  {
    seasonNumber: { type: Number, required: true },
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, default: '' },
    rank: { type: Number, required: true },
    reward: { type: Number, required: true },
    distributedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

leaderboardRewardSchema.index({ seasonNumber: 1 });
leaderboardRewardSchema.index({ userId: 1, seasonNumber: 1 });
leaderboardRewardSchema.index({ seasonNumber: 1, rank: 1 }, { unique: true });

export default mongoose.model('LeaderboardReward', leaderboardRewardSchema);
