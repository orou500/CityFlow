import mongoose from 'mongoose';

const bidSchema = new mongoose.Schema(
  {
    bidderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    tick: { type: Number, required: true },
    username: { type: String },
    // For company bids, the id of the auction-bid proposal that produced this
    // entry. Lets the stale-recovery job detect that a bid was already placed
    // by a crashed worker and never execute it a second time.
    auctionBidProposalId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

const activitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['bid', 'outbid', 'reserve_met', 'extended', 'watched', 'unwatched', 'created', 'ended', 'won'],
      required: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    username: { type: String },
    amount: { type: Number },
    message: { type: String },
    tick: { type: Number },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

/**
 * Immutable capture of the property at auction creation time.
 *
 * Live Property documents can legitimately disappear after an auction ends
 * (bank properties created solely for an auction are recycled on a
 * no-winner/cancelled settlement to keep the DB light). Historical auction
 * records must remain fully readable regardless, so this snapshot preserves
 * every display-relevant field forever. It is written once when the auction is
 * created (and defensively backfilled right before any reference-clearing
 * deletion) and NEVER mutated afterwards — settlement outcome lives in the
 * auction fields (winnerId/winningBid/status), not here.
 */
const propertySnapshotSchema = new mongoose.Schema(
  {
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
    name: { type: String },
    type: { type: String },
    propertyRating: { type: String },
    condition: { type: Number },
    currentPrice: { type: Number },
    basePrice: { type: Number },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', default: null },
    location: { type: String },
  },
  { _id: false, timestamps: false },
);

const auctionSchema = new mongoose.Schema(
  {
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    // Immutable creation-time copy of the property (see propertySnapshotSchema).
    propertySnapshot: propertySnapshotSchema,
    // Number of anti-sniping extensions actually applied. Gated by
    // AUCTION_CONFIG.maxAntiSnipingExtensions so the countdown can never be
    // pushed out repeatedly by a run of last-minute bidders.
    extensionCount: { type: Number, default: 0 },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sellerType: { type: String, enum: ['bank', 'player', 'event'], required: true },
    auctionType: { type: String, enum: ['standard', 'reserve'], default: 'standard' },
    reservePrice: { type: Number, default: 0 },
    reserveMet: { type: Boolean, default: false },
    startingBid: { type: Number, required: true },
    currentBid: { type: Number, default: 0 },
    currentBidderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['upcoming', 'active', 'ending', 'ended', 'cancelled'], default: 'upcoming' },
    startTick: { type: Number, required: true },
    endTick: { type: Number, required: true },
    originalEndTick: { type: Number, required: true },
    endingStartedAt: { type: Number, default: null },
    antiSnipingExtension: { type: Number, default: 1 },
    bidIncrement: { type: Number, required: true },
    totalBids: { type: Number, default: 0 },
    uniqueBidders: { type: Number, default: 0 },
    bids: [bidSchema],
    watchers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    watcherCount: { type: Number, default: 0 },
    activity: [activitySchema],
    winnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    winningBid: { type: Number, default: 0 },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'RealEstateCompany', default: null },
    previousOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    previousForSale: { type: Boolean, default: null },
  },
  { timestamps: true },
);

auctionSchema.index({ status: 1 });
auctionSchema.index({ endTick: 1 });
auctionSchema.index({ sellerId: 1 });
auctionSchema.index({ propertyId: 1 });
auctionSchema.index({ currentBidderId: 1 });
auctionSchema.index({ status: 1, endTick: 1 });
auctionSchema.index({ status: 1, endingStartedAt: 1 });
auctionSchema.index({ watchers: 1 });
auctionSchema.index({ createdAt: -1 });

auctionSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    if (ret._id && typeof ret._id === 'object') {
      ret._id = ret._id.toString();
    }
    if (ret.propertyId && typeof ret.propertyId === 'object' && ret.propertyId._id) {
      ret.propertyId = {
        _id: ret.propertyId._id.toString(),
        name: ret.propertyId.name,
        type: ret.propertyId.type,
        currentPrice: ret.propertyId.currentPrice,
        intrinsicValue: ret.propertyId.intrinsicValue,
        rent: ret.propertyId.rent,
        condition: ret.propertyId.condition,
        propertyRating: ret.propertyId.propertyRating,
        cityId: ret.propertyId.cityId,
        districtId: ret.propertyId.districtId,
        occupancy: ret.propertyId.occupancy,
        qualityScore: ret.propertyId.qualityScore,
      };
    } else if (ret.propertyId && typeof ret.propertyId === 'object' && ret.propertyId.toString) {
      ret.propertyId = ret.propertyId.toString();
    }
    if (ret.sellerId && typeof ret.sellerId === 'object' && ret.sellerId._id) {
      ret.sellerId = { _id: ret.sellerId._id.toString(), username: ret.sellerId.username };
    } else if (ret.sellerId && typeof ret.sellerId === 'object' && ret.sellerId.toString) {
      ret.sellerId = ret.sellerId.toString();
    }
    if (ret.currentBidderId && typeof ret.currentBidderId === 'object' && ret.currentBidderId._id) {
      ret.currentBidderId = { _id: ret.currentBidderId._id.toString(), username: ret.currentBidderId.username };
    } else if (ret.currentBidderId && typeof ret.currentBidderId === 'object' && ret.currentBidderId.toString) {
      ret.currentBidderId = ret.currentBidderId.toString();
    }
    if (ret.winnerId && typeof ret.winnerId === 'object' && ret.winnerId._id) {
      ret.winnerId = { _id: ret.winnerId._id.toString(), username: ret.winnerId.username };
    } else if (ret.winnerId && typeof ret.winnerId === 'object' && ret.winnerId.toString) {
      ret.winnerId = ret.winnerId.toString();
    }
    if (ret.watchers && Array.isArray(ret.watchers)) {
      ret.watchers = ret.watchers.map((w) =>
        typeof w === 'object' && w._id ? w._id.toString() : w?.toString?.() || w,
      );
    }
    return ret;
  },
});

export default mongoose.model('Auction', auctionSchema);
