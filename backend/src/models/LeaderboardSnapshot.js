import mongoose from 'mongoose';

const rankingEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'RealEstateCompany', default: null },
    username: { type: String, required: true },
    displayName: { type: String, default: '' },
    avatar: { type: String, default: '' },
    value: { type: Number, required: true },
    rank: { type: Number, required: true },
    previousRank: { type: Number, default: null },
    rankChange: { type: Number, default: 0 },
  },
  { _id: false },
);

const leaderboardSnapshotSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: [
        'netWorth',
        'properties',
        'passiveIncome',
        'dealVolume',
        'cityInfluence',
        'companyNetWorth',
        'companyProperties',
        'companyIncome',
        'companyReputation',
        'companyGrowth',
        'ipoMarketCap',
        'ipoDividendYield',
        'ipoPriceGrowth',
      ],
      required: true,
    },
    seasonNumber: { type: Number, required: true },
    tickNumber: { type: Number, required: true },
    rankings: [rankingEntrySchema],
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

leaderboardSnapshotSchema.index({ category: 1, seasonNumber: -1 });
leaderboardSnapshotSchema.index({ category: 1, tickNumber: -1 });

export default mongoose.model('LeaderboardSnapshot', leaderboardSnapshotSchema);
