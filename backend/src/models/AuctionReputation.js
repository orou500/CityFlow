import mongoose from 'mongoose';

const auctionReputationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    auctionsWon: { type: Number, default: 0 },
    auctionsSold: { type: Number, default: 0 },
    totalVolume: { type: Number, default: 0 },
    highestWinningBid: { type: Number, default: 0 },
    highestPropertySold: { type: Number, default: 0 },
    totalProfit: { type: Number, default: 0 },
    totalSales: { type: Number, default: 0 },
    averageProfit: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    totalParticipations: { type: Number, default: 0 },
    totalBidsPlaced: { type: Number, default: 0 },
  },
  { timestamps: true },
);

auctionReputationSchema.index({ userId: 1 });
auctionReputationSchema.index({ auctionsWon: -1 });
auctionReputationSchema.index({ totalVolume: -1 });

export default mongoose.model('AuctionReputation', auctionReputationSchema);
