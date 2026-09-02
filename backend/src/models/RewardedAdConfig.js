import mongoose from 'mongoose';

// Singleton store for admin-tunable rewarded-ads settings that have no natural
// home in the env-driven `config.rewardedAds`. Only the estimated CPM
// (US dollars per thousand impressions) is persisted here so the Admin
// Dashboard can project estimated revenue. The VAST URL and every other
// sensitive market/config value stays env-driven and is never exposed via the
// admin analytics API.
const rewardedAdConfigSchema = new mongoose.Schema(
  {
    key: { type: String, enum: ['default'], default: 'default', unique: true },
    estimatedCpm: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

export const DEFAULT_ESTIMATED_CPM = 2;

export async function getRewardedAdConfig() {
  const doc = await mongoose.model('RewardedAdConfig').findOne({ key: 'default' });
  return doc ? { estimatedCpm: doc.estimatedCpm } : { estimatedCpm: DEFAULT_ESTIMATED_CPM };
}

export default mongoose.model('RewardedAdConfig', rewardedAdConfigSchema);
