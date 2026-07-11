import mongoose from 'mongoose';

const seasonSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true, unique: true },
    name: { type: String, default: '' },
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null },
    archive: {
      playerRankings: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          username: String,
          displayName: String,
          netWorth: Number,
          balance: Number,
          portfolioValue: Number,
          propertiesOwned: Number,
          rank: Number,
        },
      ],
      cityStatistics: [
        {
          cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City' },
          name: String,
          finalAvgPrice: Number,
          finalDemandIndex: Number,
          finalSupplyIndex: Number,
          propertyCount: Number,
          population: Number,
        },
      ],
      marketStatistics: {
        totalTransactions: { type: Number, default: 0 },
        totalVolume: { type: Number, default: 0 },
        totalPropertiesTraded: { type: Number, default: 0 },
        avgPropertyPrice: { type: Number, default: 0 },
      },
      economicStatistics: {
        totalCashInCirculation: { type: Number, default: 0 },
        totalProperties: { type: Number, default: 0 },
        totalActiveLoans: { type: Number, default: 0 },
        totalConstructionProjects: { type: Number, default: 0 },
        tickCount: { type: Number, default: 0 },
      },
      winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      totalPlayers: { type: Number, default: 0 },
      totalTransactions: { type: Number, default: 0 },
      summary: { type: String, default: '' },
    },
  },
  { timestamps: true },
);

seasonSchema.index({ status: 1 });
seasonSchema.index({ number: -1 });

export default mongoose.model('Season', seasonSchema);
