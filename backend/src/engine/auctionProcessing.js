import mongoose from 'mongoose';
import Auction from '../models/Auction.js';
import AuctionReputation from '../models/AuctionReputation.js';
import Property from '../models/Property.js';
import User from '../models/User.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import CompanyAuditLog from '../models/CompanyAuditLog.js';
import { AUCTION_CONFIG, AUCTION_PROPERTY_POOL, RARITY_WEIGHTS } from '../config/auctions.js';
import { clampMonthlyRent } from '../config/propertyManagement.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import { emitToAll } from '../socket/index.js';
import { cacheDel } from '../utils/cache.js';
import { cacheKeys } from '../utils/cacheKeys.js';
import { triggerMissionProgress } from '../utils/missionTrigger.js';
import { releaseAuctionReservations } from '../utils/auctionMoney.js';
import { buildPropertySnapshot } from '../utils/auctionProperty.js';
import { getTickNumber } from '../models/GameState.js';

export function emitAuctionBid(auctionId, data) {
  emitToAll(`auction:bid`, { auctionId, ...data });
}

export function emitAuctionExtended(auctionId, data) {
  emitToAll(`auction:extended`, { auctionId, ...data });
}

export function emitAuctionEnded(auctionId, data) {
  emitToAll(`auction:ended`, { auctionId, ...data });
}

export function emitAuctionActivity(auctionId, activity) {
  emitToAll(`auction:activity`, { auctionId, activity });
}

function pickRarity() {
  const total = Object.values(RARITY_WEIGHTS).reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return 'rare';
}

/**
 * Atomically claims an expired auction for settlement: transitions it from
 * `active` to `ending` exactly once. In a multi-replica deployment only the
 * instance that wins this claim may settle the auction, so the same auction
 * can never be settled twice (double funds transfer, duplicate won activity,
 * duplicate notifications).
 */
async function claimAuctionForSettlement(auctionId, currentTick) {
  return Auction.findOneAndUpdate(
    { _id: auctionId, status: 'active' },
    { $set: { status: 'ending', endingStartedAt: currentTick } },
    { new: true },
  );
}

/**
 * Settles a claimed auction and, if settlement crashes, transitions it to a
 * safe terminal state:
 *  - status 'cancelled' with winner fields cleared (the claim was made but the
 *    settlement never completed, so no winner may be recorded)
 *  - reservations released (no one may keep funds tied to an unsettled auction)
 *  - the property is NEVER recycled on this path: the crash may have happened
 *    after the winner was decided or the property transferred, so the Property
 *    doc is kept for reconciliation instead of being destroyed.
 *
 * Used by the tick loop AND by resolveStuckAuction so a settlement error in
 * either path can never leave an auction silently stuck at 'ending'.
 */
async function settleWithCrashRecovery(claimedAuction) {
  const currentTick = await getTickNumber();
  try {
    await settleAuction(claimedAuction);
  } catch (err) {
    console.error(`[AUCTION-TICK ${currentTick}] ✗ Failed to settle auction ${claimedAuction._id}:`, err.message);
    await Auction.updateOne(
      { _id: claimedAuction._id },
      { $set: { status: 'cancelled', currentBidderId: null, winnerId: null, winningBid: 0 } },
    );
    await releaseAuctionReservations(claimedAuction._id);
    const crashedProperty = await Property.findById(claimedAuction.propertyId);
    await recoverAuctionProperty(claimedAuction, crashedProperty, 'settlement crash', { deleteBankProperty: false });
  }
}

export async function processAuctions() {
  const currentTick = await getTickNumber();
  let activated = 0;
  let ending = 0;
  let completed = 0;

  const upcomingToActivate = await Auction.find({
    status: 'upcoming',
    startTick: { $lte: currentTick },
  });

  if (upcomingToActivate.length > 0) {
    await Auction.updateMany({ _id: { $in: upcomingToActivate.map((a) => a._id) } }, { $set: { status: 'active' } });
    activated = upcomingToActivate.length;
  }

  const expiredAuctions = await Auction.find({
    status: 'active',
    endTick: { $lte: currentTick },
  });

  for (const auction of expiredAuctions) {
    // Only the instance that wins the atomic claim settles this auction.
    const claimed = await claimAuctionForSettlement(auction._id, currentTick);
    if (!claimed) continue;
    await settleWithCrashRecovery(claimed);
    ending++;
  }

  // Only finalized (settled) auctions may leave the 'ending' phase. A claimed
  // but never-settled auction (worker crash between claim and settlement, or a
  // settlement that crashed before stamping settledAt) stays 'ending' and is
  // picked up by the stuck-ending recovery below — it can never be silently
  // recorded as 'ended' without a settlement outcome.
  const endingCompleted = await Auction.find({
    status: 'ending',
    endingStartedAt: { $lte: currentTick - AUCTION_CONFIG.endingDurationTicks },
    $or: [{ settledAt: { $ne: null } }, { settledAt: { $exists: false } }],
  });

  if (endingCompleted.length > 0) {
    await Auction.updateMany({ _id: { $in: endingCompleted.map((a) => a._id) } }, { $set: { status: 'ended' } });
    // Safety net: any reservations still held were never settled — release them
    for (const auction of endingCompleted) {
      await releaseAuctionReservations(auction._id);
    }
    completed = endingCompleted.length;
  }

  const stuckEnding = await Auction.find({
    status: 'ending',
    endingStartedAt: { $lte: currentTick - 10 },
  });

  if (stuckEnding.length > 0) {
    await Auction.updateMany(
      { _id: { $in: stuckEnding.map((a) => a._id) } },
      { $set: { status: 'cancelled', currentBidderId: null } },
    );
    for (const auction of stuckEnding) {
      await releaseAuctionReservations(auction._id);
      const stuckProperty = await Property.findById(auction.propertyId);
      // Same guard as the crash path: an 'ending'-stuck auction may already have
      // a decided winner / partial transfer — never recycle its property either.
      await recoverAuctionProperty(auction, stuckProperty, 'stuck ending', { deleteBankProperty: false });
    }
  }

  await Promise.all([cacheDel(cacheKeys.auctionFeatured()), cacheDel(cacheKeys.auctionAnalytics())]);

  return { activated, ending, completed };
}

export async function resolveStuckAuction(auctionId) {
  const auction = await Auction.findById(auctionId);
  if (!auction) return null;
  const currentTick = await getTickNumber();
  if (auction.status === 'active' && auction.endTick <= currentTick) {
    // Same atomic claim as the tick path: a concurrent tick or bid request
    // that already settled this auction makes this a no-op.
    const claimed = await claimAuctionForSettlement(auctionId, currentTick);
    if (!claimed) return auction;
    // Crash-safe: a settlement error here must NOT be swallowed silently
    // (the caller's .catch(() => {}) previously left the auction stuck at
    // 'ending' with no settlement and no recovery).
    await settleWithCrashRecovery(claimed);
    console.log(`[AUCTIONS] Resolved stuck auction ${auctionId} → ending at tick ${currentTick}`);
    return claimed;
  }
  return auction;
}

/**
 * Recovers or cleans up the property after an auction ends without a winner
 * (no bids, reserve not met, insufficient funds for winner, or settlement crash).
 *
 *  - Bank properties (created solely for auction) are deleted — they have no
 *    owner and no purpose outside the auction. Ambiguous paths (crash / stuck
 *    ending) pass `deleteBankProperty: false` so the property survives for
 *    reconciliation — a winner may already have been charged/transferred.
 *  - Player-listed properties are restored to the marketplace so the seller
 *    can sell or re-auction them.
 */
async function recoverAuctionProperty(auction, property, reason, options = {}) {
  if (!property) return;

  if (auction.sellerType === 'bank') {
    // Preserve an immutable display snapshot BEFORE the bank property is
    // recycled, so the historical auction record stays fully readable even
    // though the live Property document is gone.
    if (!auction.propertySnapshot && property) {
      await Auction.updateOne(
        { _id: auction._id, propertySnapshot: { $exists: false } },
        { $set: { propertySnapshot: buildPropertySnapshot(property) } },
      );
    }
    // Ambiguous paths (settlement crash / stuck ending) pass deleteBankProperty:
    // false — the property may belong to a partially-settled winner, so it is
    // kept for reconciliation instead of being destroyed.
    if (options.deleteBankProperty !== false) {
      await Property.findByIdAndDelete(property._id);
      console.log(`[AUCTION-SETTLE] ${reason}: deleted bank property ${property._id} (auction ${auction._id})`);
    } else {
      console.log(
        `[AUCTION-SETTLE] ${reason}: kept bank property ${property._id} (auction ${auction._id}) — left for reconciliation`,
      );
    }
  } else if (
    auction.sellerType === 'player' &&
    property.ownerId &&
    property.ownerId.toString() === (auction.sellerId?.toString() || '')
  ) {
    property.forSale = true;
    await property.save();
    console.log(
      `[AUCTION-SETTLE] ${reason}: restored player property ${property._id} to marketplace (auction ${auction._id})`,
    );
  }
}

async function settleAuction(auction) {
  const currentTick = await getTickNumber();

  // Idempotency guard: settlement may only run on an auction this instance
  // claimed (status 'active' -> 'ending'). Never settle twice.
  if (!auction || auction.status !== 'ending') return;

  const property = await Property.findById(auction.propertyId);
  if (!property) {
    auction.status = 'cancelled';
    await auction.save();
    await releaseAuctionReservations(auction._id);
    return;
  }

  const reserveMet = auction.auctionType === 'reserve' ? auction.currentBid >= auction.reservePrice : true;

  // ── Winner selection: only from valid persisted bids ──────────────────────
  // The winner must be the bidder of the highest valid bid in `auction.bids`.
  // currentBidderId is the authoritative tracked leader, but we defensively
  // reconcile it against the canonical bid history and NEVER fall back to a
  // system actor, the auction creator, or any non-bidder identity.
  const validBids = (auction.bids || []).filter(
    (b) => b && b.bidderId && mongoose.isValidObjectId(b.bidderId) && Number.isFinite(b.amount) && b.amount > 0,
  );
  const highestBid = validBids.reduce((max, b) => (!max || b.amount > max.amount ? b : max), null);

  let winnerId = auction.currentBidderId;
  if (highestBid) {
    // If the tracked leader disagrees with the highest persisted bid (corruption
    // or a race), the persisted bid wins — the winner always corresponds to an
    // actual bid.
    if (!winnerId || winnerId.toString() !== highestBid.bidderId.toString()) {
      winnerId = highestBid.bidderId;
    }
  } else if (auction.currentBid > 0) {
    // A positive currentBid with no valid persisted bid is data corruption:
    // do not invent a winner.
    winnerId = null;
  }

  if (winnerId && auction.currentBid > 0 && reserveMet) {
    auction.winnerId = winnerId;
    auction.winningBid = auction.currentBid;
    auction.reserveMet = true;

    // ── Company winner ─────────────────────────────────────────────────────
    // A company bid must settle as a company win. The bid is attributed to the
    // company (bidderId === companyId and/or auctionBidProposalId set), and the
    // company treasury already paid at bid time — never debit a user, never
    // transfer the property to the voter who merely approved the proposal.
    const isCompanyWinner =
      !!auction.companyId &&
      !!winnerId &&
      (winnerId.toString() === auction.companyId.toString() || !!highestBid?.auctionBidProposalId);

    if (isCompanyWinner) {
      const company = await RealEstateCompany.findById(auction.companyId);
      if (!company) {
        auction.winnerId = null;
        auction.winningBid = 0;
        auction.settledAt = currentTick;
        await auction.save();
        await releaseAuctionReservations(auction._id);
        await invalidateAuctionCaches(auction);
        return;
      }

      // The winner is ALWAYS the company. For legacy bids the persisted
      // bidderId may still be a voter (pre-fix), so override with the company.
      auction.winnerId = auction.companyId;
      auction.settledAt = currentTick;
      auction.activity.push({
        type: 'won',
        userId: auction.companyId,
        username: company.name,
        amount: auction.currentBid,
        tick: currentTick,
      });
      await auction.save();

      property.ownerId = null;
      property.companyId = company._id;
      property.forSale = false;
      property.lastPurchasePrice = auction.winningBid;
      property.lastPurchaseDate = new Date();
      property.investmentHistory.push({
        type: 'purchase',
        amount: auction.winningBid,
        tick: currentTick,
        description: `Won auction for ${property.name}`,
      });
      await property.save();

      company.stats = company.stats || {};
      company.stats.propertiesOwned = (company.stats.propertiesOwned || 0) + 1;
      company.reputation = Math.min(100, (company.reputation || 0) + 5);
      await company.save();

      await CompanyAuditLog.create({
        companyId: company._id,
        userId: null,
        action: 'property_purchased',
        details: {
          propertyId: property._id,
          propertyName: property.name,
          price: auction.winningBid,
          source: 'auction',
        },
        tick: currentTick,
      });

      for (const m of company.members) {
        if (m.userId) {
          await enqueueNotification({
            userId: m.userId,
            type: 'system',
            title: 'Auction Won by Company',
            message: `${company.name} won the auction for ${property.name} with a bid of $${auction.winningBid.toLocaleString()}.`,
            eventKey: `auction:${auction._id}:company_won:${m.userId}`,
            route: `/auctions/${auction._id}`,
            entityType: 'auction',
            entityId: auction._id,
            relatedId: auction._id,
            global: false,
          });
        }
      }

      emitAuctionEnded(auction._id.toString(), {
        winnerId: company._id.toString(),
        winnerUsername: company.name,
        winningBid: auction.winningBid,
      });

      await invalidateAuctionCaches(auction);
      return;
    }

    const winner = await User.findById(winnerId);

    if (!winner) {
      // Deleted/missing user can never become a winner. Release funds and mark
      // the auction as having no winner.
      auction.winnerId = null;
      auction.winningBid = 0;
      auction.settledAt = currentTick;
      auction.activity.push({
        type: 'ended',
        message: 'Auction ended without a winner',
        tick: currentTick,
      });
      await auction.save();

      // The other bidders' reservations are released below — tell them why.
      const remainingBidders = new Set(
        (auction.bids || []).map((b) => b.bidderId?.toString()).filter((id) => id && mongoose.isValidObjectId(id)),
      );
      for (const bidderId of remainingBidders) {
        await enqueueNotification({
          userId: new mongoose.Types.ObjectId(bidderId),
          type: 'system',
          title: 'Auction Ended - No Winner',
          message: `The auction for ${property.name} ended without a valid winning bidder. Your reserved funds have been released.`,
          eventKey: `auction:${auction._id}:no_winner:${bidderId}`,
          route: `/auctions/${auction._id}`,
          entityType: 'auction',
          entityId: auction._id,
          relatedId: auction._id,
          global: false,
        });
      }

      if (auction.sellerId && auction.sellerType === 'player') {
        await enqueueNotification({
          userId: auction.sellerId,
          type: 'system',
          title: 'Auction Ended - No Winner',
          message: `Your auction for ${property.name} ended without a valid winning bidder.`,
          eventKey: `auction:${auction._id}:no_winner:${auction.sellerId}`,
          route: `/auctions/${auction._id}`,
          entityType: 'auction',
          entityId: auction._id,
          relatedId: auction._id,
          global: false,
        });
      }

      emitAuctionEnded(auction._id.toString(), { winnerId: null, winningBid: 0 });

      await releaseAuctionReservations(auction._id);
      await invalidateAuctionCaches(auction);
      return;
    }

    // The won activity carries the REAL winner's username so the UI can never
    // fall back to a "System" label for the winner.
    auction.activity.push({
      type: 'won',
      userId: winnerId,
      username: winner.username,
      amount: auction.currentBid,
      tick: currentTick,
    });

    await auction.save();

    if (winner.balance >= auction.winningBid) {
      // Transfer-first ordering: the property is committed to the winner BEFORE
      // they are debited, so a crash mid-settlement can never leave a winner
      // charged for a property they do not own. The worst-case window (crash
      // between the two writes) leaves the property transferred and the payment
      // uncollected — a recoverable freebie, never a paid loss.
      property.ownerId = winner._id;
      property.forSale = false;
      property.lastPurchasePrice = auction.winningBid;
      property.lastPurchaseDate = new Date();
      property.investmentHistory.push({
        type: 'purchase',
        amount: auction.winningBid,
        tick: currentTick,
        description: `Won auction for ${property.name}`,
      });
      await property.save();

      // The reserved funds are converted into the purchase payment
      winner.balance -= auction.winningBid;
      winner.reservedAuctionFunds = Math.max(0, (winner.reservedAuctionFunds || 0) - auction.winningBid);
      if (!winner.ownedProperties.includes(auction.propertyId)) {
        winner.ownedProperties.push(auction.propertyId);
      }
      await winner.save();

      // Winner's reservation was converted — remove the tracking doc
      await mongoose
        .model('AuctionReservation')
        .deleteOne({ userId: winner._id, auctionId: auction._id })
        .catch(() => {});

      if (auction.sellerId && auction.sellerType === 'player') {
        const commission = Math.floor(auction.winningBid * (AUCTION_CONFIG.playerSoldCommissionPercent / 100));
        const sellerProceeds = auction.winningBid - commission;
        const seller = await User.findById(auction.sellerId);
        if (seller) {
          seller.balance += sellerProceeds;
          await seller.save();
        }
      }

      await updateReputation(auction.winnerId, 'won', auction.winningBid);
      if (auction.sellerId) {
        await updateReputation(auction.sellerId, 'sold', auction.winningBid);
      }

      triggerMissionProgress(winnerId, 'auction_won');
      if (auction.sellerId) {
        triggerMissionProgress(auction.sellerId, 'auction_sold');
      }

      await enqueueNotification({
        userId: winnerId,
        type: 'system',
        title: 'Auction Won!',
        message: `You won the auction for ${property.name} with a bid of $${auction.winningBid.toLocaleString()}!`,
        eventKey: `auction:${auction._id}:won:${winnerId}`,
        relatedId: auction._id,
        route: `/auctions`,
        entityType: 'auction',
        global: false,
      });

      emitAuctionEnded(auction._id.toString(), {
        winnerId: winnerId.toString(),
        winnerUsername: winner.username,
        winningBid: auction.winningBid,
      });

      if (auction.sellerId && auction.sellerType === 'player') {
        await enqueueNotification({
          userId: auction.sellerId,
          type: 'system',
          title: 'Property Sold at Auction',
          message: `Your property ${property.name} sold at auction for $${auction.winningBid.toLocaleString()}!`,
          eventKey: `auction:${auction._id}:sold:${auction.sellerId}`,
          route: `/auctions/${auction._id}`,
          entityType: 'auction',
          entityId: auction._id,
          relatedId: auction._id,
          global: false,
        });
      }

      const outbidUserIds = auction.bids.map((b) => b.bidderId.toString()).filter((id) => id !== winnerId.toString());
      const uniqueOutbid = [...new Set(outbidUserIds)];
      for (const uid of uniqueOutbid) {
        await enqueueNotification({
          userId: new mongoose.Types.ObjectId(uid),
          type: 'system',
          title: 'Auction Ended',
          message: `The auction for ${property.name} has ended. You were outbid.`,
          eventKey: `auction:${auction._id}:outbid:${uid}`,
          route: `/auctions/${auction._id}`,
          entityType: 'auction',
          entityId: auction._id,
          relatedId: auction._id,
          global: false,
        });
      }

      for (const watcherId of auction.watchers) {
        if (watcherId.toString() !== winnerId.toString() && !uniqueOutbid.includes(watcherId.toString())) {
          await enqueueNotification({
            userId: watcherId,
            type: 'system',
            title: 'Watched Auction Ended',
            message: `The auction for ${property.name} has ended. Winner: $${auction.winningBid.toLocaleString()}`,
            eventKey: `auction:${auction._id}:watched_ended:${watcherId}`,
            route: `/auctions/${auction._id}`,
            entityType: 'auction',
            entityId: auction._id,
            relatedId: auction._id,
            global: false,
          });
        }
      }

      // Settlement outcome is fully committed (winner decided, property
      // transferred, payment collected, notifications queued). Stamp the
      // settlement record so the state machine may finalize this auction as
      // 'ended' instead of treating it as claimed-but-unsettled.
      auction.settledAt = currentTick;
      await auction.save();
    } else {
      if (winner) {
        await enqueueNotification({
          userId: winner._id,
          type: 'system',
          title: 'Auction Won - Insufficient Funds',
          message: `You won the auction for ${property.name} but have insufficient funds. The auction has been cancelled.`,
          eventKey: `auction:${auction._id}:insufficient_funds:${winner._id}`,
          route: `/auctions/${auction._id}`,
          entityType: 'auction',
          entityId: auction._id,
          relatedId: auction._id,
          global: false,
        });
      }

      // The winner could not pay, so the auction is cancelled and the other
      // bidders' reservations are released (releaseAuctionReservations below).
      // Tell every other bidder what happened — a silent release looks exactly
      // like "I won but got nothing".
      const otherBidders = new Set(
        (auction.bids || []).map((b) => b.bidderId?.toString()).filter((id) => id && id !== winnerId.toString()),
      );
      for (const bidderId of otherBidders) {
        await enqueueNotification({
          userId: new mongoose.Types.ObjectId(bidderId),
          type: 'system',
          title: 'Auction Ended - No Winner',
          message: `The auction for ${property.name} was cancelled because the winning bidder could not pay. Your reserved funds have been released.`,
          eventKey: `auction:${auction._id}:no_winner:${bidderId}`,
          route: `/auctions/${auction._id}`,
          entityType: 'auction',
          entityId: auction._id,
          relatedId: auction._id,
          global: false,
        });
      }

      auction.status = 'cancelled';
      auction.currentBidderId = null;
      auction.settledAt = currentTick;
      await auction.save();
      await recoverAuctionProperty(auction, property, 'insufficient funds');
    }
  } else {
    auction.winnerId = null;
    auction.winningBid = 0;
    auction.currentBidderId = null;
    auction.settledAt = currentTick;
    auction.activity.push({
      type: 'ended',
      message: 'Auction ended without a winner',
      tick: currentTick,
    });
    await auction.save();

    await recoverAuctionProperty(auction, property, 'no winner');

    // No winner was determined (no bids, reserve not met, or no valid
    // bidder), so the highest bidder(s) must be told the outcome — their
    // reservations were released below. Without this, a player whose bid was
    // below the reserve sees the auction "end" with no explanation.
    const uniqueBidders = new Set(
      (auction.bids || []).map((b) => b.bidderId?.toString()).filter((id) => id && mongoose.isValidObjectId(id)),
    );
    for (const bidderId of uniqueBidders) {
      await enqueueNotification({
        userId: new mongoose.Types.ObjectId(bidderId),
        type: 'system',
        title: 'Auction Ended - No Winner',
        message: `The auction for ${property.name} ended without a winner. Your reserved funds have been released.`,
        eventKey: `auction:${auction._id}:no_winner:${bidderId}`,
        route: `/auctions/${auction._id}`,
        entityType: 'auction',
        entityId: auction._id,
        relatedId: auction._id,
        global: false,
      });
    }

    if (auction.sellerId && auction.sellerType === 'player') {
      await enqueueNotification({
        userId: auction.sellerId,
        type: 'system',
        title: 'Auction Ended - No Winner',
        message: `Your auction for ${property.name} ended without meeting the reserve price.`,
        eventKey: `auction:${auction._id}:no_winner:${auction.sellerId}`,
        route: `/auctions/${auction._id}`,
        entityType: 'auction',
        entityId: auction._id,
        relatedId: auction._id,
        global: false,
      });
    }

    // Surface the outcome to open clients immediately (same event the winner
    // path emits, with a null winner): the UI can then show "ended - no
    // winner" instead of an endless "finalizing" state.
    emitAuctionEnded(auction._id.toString(), { winnerId: null, winningBid: 0 });
  }

  // Release any reservations still held on this auction (losers, cancelled or
  // no-winner paths). The winner's reservation was converted above.
  await releaseAuctionReservations(auction._id);

  await invalidateAuctionCaches(auction);
}

/**
 * Invalidates the Redis auction caches (detail, featured, analytics, and
 * per-user analytics) after settlement. Kept idempotent — cache keys are
 * just deleted, so a second settlement attempt cannot resurrect stale data.
 */
async function invalidateAuctionCaches(auction) {
  const involvedUserIds = new Set();
  if (auction.winnerId) involvedUserIds.add(auction.winnerId.toString());
  if (auction.currentBidderId) involvedUserIds.add(auction.currentBidderId.toString());
  if (auction.sellerId) involvedUserIds.add(auction.sellerId.toString());
  for (const b of auction.bids || []) {
    if (b.bidderId) involvedUserIds.add(b.bidderId.toString());
  }
  await Promise.all([...involvedUserIds].map((uid) => cacheDel(cacheKeys.auctionMyAnalytics(uid))));

  await Promise.all([
    cacheDel(cacheKeys.auction(auction._id.toString())),
    cacheDel(cacheKeys.auctionFeatured()),
    cacheDel(cacheKeys.auctionAnalytics()),
  ]);
}

async function updateReputation(userId, action, amount) {
  try {
    let rep = await AuctionReputation.findOne({ userId });
    if (!rep) {
      rep = await AuctionReputation.create({ userId });
    }

    if (action === 'won') {
      rep.auctionsWon += 1;
      rep.totalVolume += amount;
      rep.highestWinningBid = Math.max(rep.highestWinningBid, amount);
    } else if (action === 'sold') {
      rep.auctionsSold += 1;
      rep.highestPropertySold = Math.max(rep.highestPropertySold, amount);
      rep.totalSales += amount;
      rep.totalProfit += amount;
      rep.averageProfit = Math.round(rep.totalProfit / rep.auctionsSold);
    }

    if (rep.totalParticipations > 0) {
      rep.winRate = Math.round((rep.auctionsWon / rep.totalParticipations) * 100);
    }

    await rep.save();
  } catch (err) {
    console.error(`[AUCTIONS] Error updating reputation for ${userId}:`, err.message);
  }
}

export async function generateBankAuctions() {
  const currentTick = await getTickNumber();
  const generated = [];
  const config = AUCTION_CONFIG.generation;

  const playerCount = await User.countDocuments({ role: 'user' });
  const targetUpcoming = Math.min(
    config.maxUpcoming,
    Math.floor(config.baseUpcoming + playerCount * config.upcomingPerPlayer),
  );
  const targetActive = Math.min(config.maxActive, Math.floor(config.minActive + playerCount * config.activePerPlayer));

  const currentUpcoming = await Auction.countDocuments({ sellerType: 'bank', status: 'upcoming' });
  const currentActive = await Auction.countDocuments({ sellerType: 'bank', status: { $in: ['active', 'ending'] } });
  const currentTotal = currentUpcoming + currentActive;
  const targetTotal = targetUpcoming + targetActive;
  const toGenerate = Math.max(0, targetTotal - currentTotal);

  if (toGenerate === 0) return generated;

  const generateCount = Math.min(toGenerate, currentTick % config.bankAuctionIntervalTicks === 0 ? 3 : 1);

  if (generateCount === 0) return generated;

  const availableCities = await mongoose.connection.db.collection('cities').find({}).toArray();
  if (availableCities.length === 0) return generated;

  for (let i = 0; i < generateCount; i++) {
    const rarity = pickRarity();
    const pool = AUCTION_PROPERTY_POOL.filter((p) => p.rarity === rarity);
    const template =
      pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : AUCTION_PROPERTY_POOL[Math.floor(Math.random() * AUCTION_PROPERTY_POOL.length)];

    const city = availableCities[Math.floor(Math.random() * availableCities.length)];
    const cityId = new mongoose.Types.ObjectId(city._id);

    const districts = await mongoose.connection.db.collection('districts').find({ cityId }).toArray();

    const districtId =
      districts.length > 0
        ? new mongoose.Types.ObjectId(districts[Math.floor(Math.random() * districts.length)]._id)
        : null;

    const price = Math.floor(template.basePriceMin + Math.random() * (template.basePriceMax - template.basePriceMin));
    const startingBid = Math.floor(price * 0.7);
    const bidIncrement = Math.max(1000, Math.floor(startingBid * (AUCTION_CONFIG.minBidIncrementPercent / 100)));
    const duration = rarity === 'legendary' ? AUCTION_CONFIG.durations.long : AUCTION_CONFIG.durations.medium;

    const property = await Property.create({
      cityId,
      districtId,
      type: template.type,
      name: `${template.name} (${city.name})`,
      basePrice: price,
      currentPrice: price,
      intrinsicValue: Math.floor(price * 0.85),
      rent: clampMonthlyRent(price * 0.004),
      condition: 100,
      occupancy: rarity === 'legendary' ? 95 : 80,
      forSale: false,
      propertyRating: template.propertyRating,
      qualityScore: rarity === 'legendary' ? 95 : 80,
    });

    const auction = await Auction.create({
      propertyId: property._id,
      propertySnapshot: buildPropertySnapshot(property),
      sellerId: null,
      sellerType: 'bank',
      auctionType: rarity === 'legendary' ? 'reserve' : 'standard',
      reservePrice: rarity === 'legendary' ? Math.floor(price * 0.8) : 0,
      startingBid,
      currentBid: 0,
      currentBidderId: null,
      status: 'upcoming',
      startTick: currentTick + 1,
      endTick: currentTick + 1 + duration,
      originalEndTick: currentTick + 1 + duration,
      antiSnipingExtension: AUCTION_CONFIG.antiSnipingTicks,
      bidIncrement,
      previousOwnerId: null,
      previousForSale: false,
      activity: [
        {
          type: 'created',
          message: `Bank auction created for ${template.name}`,
          tick: currentTick,
        },
      ],
    });

    generated.push(auction);
  }

  return generated;
}

export async function processAntiSniping(auction) {
  const currentTick = await getTickNumber();
  const ticksRemaining = auction.endTick - currentTick;

  // Same ceiling as the bid path: an auction may only be extended a bounded
  // number of times, so a run of last-minute bidders can never push the
  // countdown out repeatedly.
  if ((auction.extensionCount || 0) >= AUCTION_CONFIG.maxAntiSnipingExtensions) {
    return false;
  }

  if (ticksRemaining <= AUCTION_CONFIG.antiSnipingThresholdTicks) {
    const newEndTick = auction.endTick + auction.antiSnipingExtension;
    auction.endTick = newEndTick;
    auction.extensionCount = (auction.extensionCount || 0) + 1;

    auction.activity.push({
      type: 'extended',
      message: `Auction extended by ${auction.antiSnipingExtension} tick(s)`,
      tick: currentTick,
    });

    await auction.save();

    emitAuctionExtended(auction._id.toString(), {
      newEndTick,
      extension: auction.antiSnipingExtension,
      currentTick,
      remainingMonths: Math.max(0, newEndTick - currentTick),
    });

    for (const watcherId of auction.watchers) {
      await enqueueNotification({
        userId: watcherId,
        type: 'system',
        title: 'Auction Extended',
        message: `An auction you're watching was extended by ${auction.antiSnipingExtension} tick(s) due to last-minute bidding!`,
        eventKey: `auction:${auction._id}:extended:${watcherId}`,
        route: `/auctions/${auction._id}`,
        entityType: 'auction',
        entityId: auction._id,
        relatedId: auction._id,
        global: false,
      });
    }

    return true;
  }

  return false;
}

export async function cancelAuction(auctionId, userId) {
  const auction = await Auction.findById(auctionId);
  if (!auction) throw new Error('Auction not found');
  if (auction.sellerId?.toString() !== userId.toString()) throw new Error('Not authorized');
  if (auction.totalBids > 0) throw new Error('Cannot cancel auction with existing bids');
  if (auction.status !== 'upcoming' && auction.status !== 'active') throw new Error('Auction cannot be cancelled');

  auction.status = 'cancelled';
  await auction.save();

  await releaseAuctionReservations(auction._id);

  await Property.findByIdAndUpdate(auction.propertyId, { forSale: true });

  for (const watcherId of auction.watchers) {
    await enqueueNotification({
      userId: watcherId,
      type: 'system',
      title: 'Auction Cancelled',
      message: 'An auction you were watching has been cancelled by the seller.',
      eventKey: `auction:${auction._id}:cancelled:${watcherId}`,
      route: `/auctions/${auction._id}`,
      entityType: 'auction',
      entityId: auction._id,
      relatedId: auction._id,
      global: false,
    });
  }

  await Promise.all([cacheDel(cacheKeys.auction(auction._id.toString())), cacheDel(cacheKeys.auctionFeatured())]);

  return auction;
}

export async function getAuctionStats() {
  const [totalAuctions, endedAuctions, totalVolume, avgBids, topCity, topDistrict, topSeller] = await Promise.all([
    Auction.countDocuments(),
    Auction.find({ status: 'ended', winningBid: { $gt: 0 } })
      .populate('propertyId', 'name')
      .lean(),
    Auction.aggregate([
      { $match: { status: 'ended', winningBid: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$winningBid' }, avg: { $avg: '$winningBid' } } },
    ]),
    Auction.aggregate([{ $match: { status: 'ended' } }, { $group: { _id: null, avg: { $avg: '$totalBids' } } }]),
    Auction.aggregate([
      { $match: { status: 'ended', winningBid: { $gt: 0 } } },
      { $lookup: { from: 'properties', localField: 'propertyId', foreignField: '_id', as: 'prop' } },
      { $unwind: '$prop' },
      { $group: { _id: '$prop.cityId', count: { $sum: 1 }, volume: { $sum: '$winningBid' } } },
      { $sort: { volume: -1 } },
      { $limit: 1 },
    ]),
    Auction.aggregate([
      { $match: { status: 'ended', winningBid: { $gt: 0 } } },
      { $lookup: { from: 'properties', localField: 'propertyId', foreignField: '_id', as: 'prop' } },
      { $unwind: '$prop' },
      { $match: { 'prop.districtId': { $ne: null } } },
      { $group: { _id: '$prop.districtId', count: { $sum: 1 }, volume: { $sum: '$winningBid' } } },
      { $sort: { volume: -1 } },
      { $limit: 1 },
    ]),
    AuctionReputation.findOne().sort({ totalVolume: -1 }).populate('userId', 'username').lean(),
  ]);

  const highest =
    endedAuctions.length > 0
      ? endedAuctions.reduce((max, a) => (a.winningBid > max.winningBid ? a : max), endedAuctions[0])
      : null;

  let mostActiveCityName = null;
  if (topCity[0]?._id) {
    const cityDoc = await mongoose.connection.db.collection('cities').findOne({ _id: topCity[0]._id });
    mostActiveCityName = cityDoc?.name || null;
  }

  let mostActiveDistrictName = null;
  if (topDistrict[0]?._id) {
    const districtDoc = await mongoose.connection.db.collection('districts').findOne({ _id: topDistrict[0]._id });
    mostActiveDistrictName = districtDoc?.name || null;
  }

  return {
    totalAuctions,
    totalCompletedAuctions: endedAuctions.length,
    highestAuctionEver: highest
      ? {
          winningBid: highest.winningBid,
          propertyName: highest.propertyId?.name || highest.propertySnapshot?.name || 'Unknown',
          auctionId: highest._id,
        }
      : null,
    totalVolume: totalVolume[0]?.total || 0,
    averageSalePrice: totalVolume[0]?.avg ? Math.round(totalVolume[0].avg) : 0,
    averageBidsPerAuction: avgBids[0]?.avg ? Math.round(avgBids[0].avg * 10) / 10 : 0,
    mostActiveCity: mostActiveCityName,
    mostActiveDistrict: mostActiveDistrictName,
    mostSuccessfulSeller: topSeller?.userId
      ? {
          userId: topSeller.userId._id,
          username: topSeller.userId.username,
          volume: topSeller.totalVolume,
        }
      : null,
  };
}
