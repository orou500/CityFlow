import mongoose from 'mongoose';

/**
 * Tracks how much of a user's balance is reserved for their current highest
 * bid on each auction. Available balance = user.balance - user.reservedAuctionFunds.
 * A reservation is created when a bid is accepted and removed when the user is
 * outbid, the auction is cancelled, or the auction settles.
 */
const auctionReservationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    auctionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

auctionReservationSchema.index({ userId: 1, auctionId: 1 }, { unique: true });
auctionReservationSchema.index({ auctionId: 1 });
auctionReservationSchema.index({ userId: 1 });

export default mongoose.model('AuctionReservation', auctionReservationSchema);
