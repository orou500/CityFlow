import mongoose from 'mongoose';
import Auction from '../models/Auction.js';
import AuctionReputation from '../models/AuctionReputation.js';
import Property from '../models/Property.js';
import User from '../models/User.js';
import { AUCTION_CONFIG, AUCTION_PROPERTY_POOL, RARITY_WEIGHTS } from '../config/auctions.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import { emitToAll } from '../socket/index.js';
import { cacheDel } from '../utils/cache.js';
import { cacheKeys } from '../utils/cacheKeys.js';
import { triggerMissionProgress } from '../utils/missionTrigger.js';

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

export async function processAuctions() {
  const currentTick = global.currentTick || 0;
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
    try {
      auction.status = 'ending';
      auction.endingStartedAt = currentTick;
      await settleAuction(auction);
      ending++;
    } catch (err) {
      console.error(`[AUCTION-TICK ${currentTick}] ✗ Failed to settle auction ${auction._id}:`, err.message);
      auction.status = 'cancelled';
      await auction.save().catch(() => {});
    }
  }

  const endingCompleted = await Auction.find({
    status: 'ending',
    endingStartedAt: { $lte: currentTick - AUCTION_CONFIG.endingDurationTicks },
  });

  if (endingCompleted.length > 0) {
    await Auction.updateMany({ _id: { $in: endingCompleted.map((a) => a._id) } }, { $set: { status: 'ended' } });
    completed = endingCompleted.length;
  }

  const stuckEnding = await Auction.find({
    status: 'ending',
    endingStartedAt: { $lte: currentTick - 10 },
  });

  if (stuckEnding.length > 0) {
    await Auction.updateMany({ _id: { $in: stuckEnding.map((a) => a._id) } }, { $set: { status: 'cancelled' } });
  }

  await Promise.all([cacheDel(cacheKeys.auctionFeatured()), cacheDel(cacheKeys.auctionAnalytics())]);

  return { activated, ending, completed };
}

export async function resolveStuckAuction(auctionId) {
  const auction = await Auction.findById(auctionId);
  if (!auction) return null;
  const currentTick = global.currentTick || 0;
  if (auction.status === 'active' && auction.endTick <= currentTick) {
    auction.status = 'ending';
    auction.endingStartedAt = currentTick;
    await settleAuction(auction);
    console.log(`[AUCTIONS] Resolved stuck auction ${auctionId} → ending at tick ${currentTick}`);
  }
  return auction;
}

async function settleAuction(auction) {
  const currentTick = global.currentTick || 0;

  const property = await Property.findById(auction.propertyId);
  if (!property) {
    auction.status = 'cancelled';
    await auction.save();
    return;
  }

  const reserveMet = auction.auctionType === 'reserve' ? auction.currentBid >= auction.reservePrice : true;

  if (auction.currentBidderId && auction.currentBid > 0 && reserveMet) {
    auction.winnerId = auction.currentBidderId;
    auction.winningBid = auction.currentBid;
    auction.reserveMet = true;

    auction.activity.push({
      type: 'won',
      userId: auction.currentBidderId,
      amount: auction.currentBid,
      tick: currentTick,
    });

    await auction.save();

    const winner = await User.findById(auction.currentBidderId);
    if (winner && winner.balance >= auction.winningBid) {
      winner.balance -= auction.winningBid;
      await winner.save();

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

      triggerMissionProgress(auction.currentBidderId, 'auction_won');
      if (auction.sellerId) {
        triggerMissionProgress(auction.sellerId, 'auction_sold');
      }

      await enqueueNotification({
        userId: auction.currentBidderId,
        type: 'system',
        title: 'Auction Won!',
        message: `You won the auction for ${property.name} with a bid of $${auction.winningBid.toLocaleString()}!`,
        relatedId: auction._id,
        global: false,
      });

      emitAuctionEnded(auction._id.toString(), {
        winnerId: auction.currentBidderId.toString(),
        winningBid: auction.winningBid,
      });

      if (auction.sellerId && auction.sellerType === 'player') {
        await enqueueNotification({
          userId: auction.sellerId,
          type: 'system',
          title: 'Property Sold at Auction',
          message: `Your property ${property.name} sold at auction for $${auction.winningBid.toLocaleString()}!`,
          relatedId: auction._id,
          global: false,
        });
      }

      const outbidUserIds = auction.bids
        .map((b) => b.bidderId.toString())
        .filter((id) => id !== auction.currentBidderId.toString());
      const uniqueOutbid = [...new Set(outbidUserIds)];
      for (const uid of uniqueOutbid) {
        await enqueueNotification({
          userId: new mongoose.Types.ObjectId(uid),
          type: 'system',
          title: 'Auction Ended',
          message: `The auction for ${property.name} has ended. You were outbid.`,
          relatedId: auction._id,
          global: false,
        });
      }

      for (const watcherId of auction.watchers) {
        if (
          watcherId.toString() !== auction.currentBidderId.toString() &&
          !uniqueOutbid.includes(watcherId.toString())
        ) {
          await enqueueNotification({
            userId: watcherId,
            type: 'system',
            title: 'Watched Auction Ended',
            message: `The auction for ${property.name} has ended. Winner: $${auction.winningBid.toLocaleString()}`,
            relatedId: auction._id,
            global: false,
          });
        }
      }
    } else {
      if (winner) {
        await enqueueNotification({
          userId: winner._id,
          type: 'system',
          title: 'Auction Won - Insufficient Funds',
          message: `You won the auction for ${property.name} but have insufficient funds. The auction has been cancelled.`,
          relatedId: auction._id,
          global: false,
        });
      }
      auction.status = 'cancelled';
      await auction.save();
    }
  } else {
    auction.winnerId = null;
    auction.winningBid = 0;
    await auction.save();

    if (auction.sellerId && auction.sellerType === 'player') {
      await enqueueNotification({
        userId: auction.sellerId,
        type: 'system',
        title: 'Auction Ended - No Winner',
        message: `Your auction for ${property.name} ended without meeting the reserve price.`,
        relatedId: auction._id,
        global: false,
      });
    }
  }

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
  const currentTick = global.currentTick || 0;
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
      rent: Math.floor(price * 0.004),
      condition: 100,
      occupancy: rarity === 'legendary' ? 95 : 80,
      forSale: false,
      propertyRating: template.propertyRating,
      qualityScore: rarity === 'legendary' ? 95 : 80,
    });

    const auction = await Auction.create({
      propertyId: property._id,
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
  const currentTick = global.currentTick || 0;
  const ticksRemaining = auction.endTick - currentTick;

  if (ticksRemaining <= AUCTION_CONFIG.antiSnipingThresholdTicks) {
    const newEndTick = auction.endTick + auction.antiSnipingExtension;
    auction.endTick = newEndTick;

    auction.activity.push({
      type: 'extended',
      message: `Auction extended by ${auction.antiSnipingExtension} tick(s)`,
      tick: currentTick,
    });

    await auction.save();

    emitAuctionExtended(auction._id.toString(), {
      newEndTick,
      extension: auction.antiSnipingExtension,
    });

    for (const watcherId of auction.watchers) {
      await enqueueNotification({
        userId: watcherId,
        type: 'system',
        title: 'Auction Extended',
        message: `An auction you're watching was extended by ${auction.antiSnipingExtension} tick(s) due to last-minute bidding!`,
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

  await Property.findByIdAndUpdate(auction.propertyId, { forSale: true });

  for (const watcherId of auction.watchers) {
    await enqueueNotification({
      userId: watcherId,
      type: 'system',
      title: 'Auction Cancelled',
      message: 'An auction you were watching has been cancelled by the seller.',
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
          propertyName: highest.propertyId?.name || 'Unknown',
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
