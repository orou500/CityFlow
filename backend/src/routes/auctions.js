import express from 'express';
import mongoose from 'mongoose';
import { body, param, query, validationResult } from 'express-validator';
import Auction from '../models/Auction.js';
import AuctionReputation from '../models/AuctionReputation.js';
import AuctionReservation from '../models/AuctionReservation.js';
import Property from '../models/Property.js';
import User from '../models/User.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import City from '../models/City.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { AUCTION_CONFIG } from '../config/auctions.js';
import { processPlayerProgress } from '../utils/playerProgress.js';
import {
  cancelAuction,
  getAuctionStats,
  emitAuctionBid,
  emitAuctionActivity,
  emitAuctionExtended,
  resolveStuckAuction,
} from '../engine/auctionProcessing.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import { cacheGet, cacheSet, cacheDel } from '../utils/cache.js';
import { cacheKeys } from '../utils/cacheKeys.js';
import { computeAuctionRemaining } from '../utils/auctionTime.js';
import { getTickNumber, getGameState } from '../models/GameState.js';
import { reserveAuctionFunds, releaseAuctionFunds, setAuctionReservation } from '../utils/auctionMoney.js';
import { getCityPropertyLimit, getCityOwnershipStats } from '../utils/ownershipLimits.js';
import { scheduleAuctionBidResolution } from '../utils/delayedJobs.js';
import { onCompanyVote } from '../utils/cacheInvalidation.js';
import { calculateAuctionBidVotingEndsAt, resolveAuctionBidProposal } from '../engine/auctionBidProposals.js';
import CompanyAuditLog from '../models/CompanyAuditLog.js';

// In-process mutex per user — serializes concurrent bids by the same player
// so reservation deltas and city-ownership checks can never race.
const userBidLocks = new Map();

async function withUserBidLock(userId, fn) {
  const key = userId.toString();
  const prev = userBidLocks.get(key) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  const chain = prev.then(() => next);
  userBidLocks.set(key, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (userBidLocks.get(key) === chain) {
      userBidLocks.delete(key);
    }
  }
}

function hasPermission(member, permission) {
  if (!member) return false;
  if (member.role === 'ceo') return true;
  if (member.role === 'director') {
    return [
      'invite_members',
      'manage_properties',
      'initiate_investments',
      'view_treasury',
      'manage_treasury',
      'manage_settings',
      'manage_applications',
      'manage_loan_requests',
      'remove_members',
    ].includes(permission);
  }
  if (member.role === 'officer') {
    return ['invite_members', 'view_treasury', 'manage_applications'].includes(permission);
  }
  return ['view_company', 'contribute_funds'].includes(permission);
}

const router = express.Router();

const bidRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many bids. Please try again later.',
});

const createRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many auction creations. Please try again later.',
});

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors
      .array()
      .map((e) => e.msg)
      .join('; ');
    return res.status(400).json({
      success: false,
      error: messages,
    });
  }
  next();
}

router.get('/featured', async (req, res) => {
  try {
    const currentTick = await getTickNumber();

    const cached = await cacheGet(cacheKeys.auctionFeatured());
    if (cached) return res.json({ success: true, auctions: cached });

    const activeAuctions = await Auction.find({
      status: 'active',
      endTick: { $gt: currentTick },
    })
      .populate('propertyId', 'name type currentPrice propertyRating condition cityId districtId')
      .populate('currentBidderId', 'username')
      .populate('sellerId', 'username')
      .lean();

    const sc = AUCTION_CONFIG.featuredScoring;
    const maxBid = Math.max(...activeAuctions.map((a) => a.currentBid || a.startingBid), 1);
    const maxBids = Math.max(...activeAuctions.map((a) => a.totalBids || 0), 1);
    const maxWatchers = Math.max(...activeAuctions.map((a) => a.watcherCount || 0), 1);

    const scored = activeAuctions.map((a) => {
      const timing = computeAuctionRemaining(a, currentTick);
      const isEndingSoon = timing.ticksRemaining <= sc.endingSoonBonus && timing.ticksRemaining > 0;
      const isHot = (a.totalBids || 0) >= AUCTION_CONFIG.featuredMinBids;
      const rarity = a.propertyId?.propertyRating || 'standard';

      const valueScore = ((a.currentBid || a.startingBid) / maxBid) * sc.valueWeight;
      const bidsScore = ((a.totalBids || 0) / maxBids) * sc.bidsWeight;
      const watchersScore = ((a.watcherCount || 0) / maxWatchers) * sc.watchersWeight;
      const rarityScore = sc.rarityBonus[rarity] || 0;
      const endingScore = isEndingSoon ? sc.endingSoonBonus : 0;

      const featuredScore = valueScore + bidsScore + watchersScore + rarityScore + endingScore;

      return {
        ...a,
        ...timing,
        isEndingSoon,
        isHot,
        featuredScore,
      };
    });

    scored.sort((a, b) => b.featuredScore - a.featuredScore);
    const featured = scored.slice(0, 10);

    await cacheSet(cacheKeys.auctionFeatured(), featured, AUCTION_CONFIG.cacheTTL.featured);

    return res.json({ success: true, auctions: featured });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const cached = await cacheGet(cacheKeys.auctionAnalytics());
    if (cached) return res.json({ success: true, stats: cached });

    const stats = await getAuctionStats();
    await cacheSet(cacheKeys.auctionAnalytics(), stats, AUCTION_CONFIG.cacheTTL.analytics);
    return res.json({ success: true, stats });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get(
  '/',
  [
    query('status').optional().isIn(['upcoming', 'active', 'ending', 'ended', 'cancelled', 'all']),
    query('sellerType').optional().isIn(['bank', 'player', 'event', 'all']),
    query('propertyType').optional().isIn(['apartment', 'house', 'commercial', 'land']),
    query('sort').optional().isIn(['endTick', 'currentBid', 'createdAt', 'totalBids']),
    query('order').optional().isIn(['asc', 'desc']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const {
        status = 'active',
        sellerType,
        propertyType,
        sort = 'endTick',
        order = 'asc',
        limit = 20,
        offset = 0,
        sellerId,
      } = req.query;
      const currentTick = await getTickNumber();

      const filter = {};
      if (status !== 'all') filter.status = status;
      if (sellerType && sellerType !== 'all') filter.sellerType = sellerType;
      if (sellerId) filter.sellerId = new mongoose.Types.ObjectId(sellerId);

      const pipeline = [
        { $match: filter },
        {
          $lookup: {
            from: 'properties',
            localField: 'propertyId',
            foreignField: '_id',
            as: 'property',
          },
        },
        { $unwind: { path: '$property', preserveNullAndEmptyArrays: true } },
      ];

      if (propertyType) {
        pipeline.push({ $match: { 'property.type': propertyType } });
      }

      const sortField =
        sort === 'endTick'
          ? 'endTick'
          : sort === 'currentBid'
            ? 'currentBid'
            : sort === 'totalBids'
              ? 'totalBids'
              : 'createdAt';
      pipeline.push({ $sort: { [sortField]: order === 'desc' ? -1 : 1 } });

      const countPipeline = [...pipeline, { $count: 'total' }];
      const countResult = await Auction.aggregate(countPipeline);
      const total = countResult.length > 0 ? countResult[0].total : 0;

      pipeline.push({ $skip: Number(offset) });
      pipeline.push({ $limit: Number(limit) });

      pipeline.push({
        $project: {
          propertyId: 1,
          sellerId: 1,
          sellerType: 1,
          auctionType: 1,
          reservePrice: 1,
          reserveMet: 1,
          startingBid: 1,
          currentBid: 1,
          currentBidderId: 1,
          status: 1,
          startTick: 1,
          endTick: 1,
          originalEndTick: 1,
          bidIncrement: 1,
          totalBids: 1,
          uniqueBidders: 1,
          watcherCount: 1,
          winnerId: 1,
          winningBid: 1,
          createdAt: 1,
          'property._id': 1,
          'property.name': 1,
          'property.type': 1,
          'property.currentPrice': 1,
          'property.condition': 1,
          'property.propertyRating': 1,
        },
      });

      const auctions = (await Auction.aggregate(pipeline)).map((a) => ({
        ...a,
        ...computeAuctionRemaining(a, currentTick),
      }));

      return res.json({
        success: true,
        auctions,
        total,
        offset: Number(offset),
        limit: Number(limit),
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.get(
  '/:id',
  optionalAuth,
  [param('id').isMongoId().withMessage('Invalid auction ID'), handleValidationErrors],
  async (req, res) => {
    try {
      const auction = await Auction.findById(req.params.id)
        .populate(
          'propertyId',
          'name type currentPrice intrinsicValue rent condition propertyRating cityId districtId occupancy qualityScore basePrice',
        )
        .populate('sellerId', 'username')
        .populate('currentBidderId', 'username')
        .populate('winnerId', 'username')
        .populate('watchers', 'username');

      if (!auction) {
        return res.status(404).json({ success: false, error: 'Auction not found' });
      }

      const currentTick = await getTickNumber();
      const auctionObj = auction.toJSON();
      Object.assign(auctionObj, computeAuctionRemaining(auction, currentTick));

      const property = auctionObj.propertyId;
      if (property && typeof property === 'object') {
        const rent = property.rent || 0;
        const price = property.currentPrice || property.basePrice || 1;
        property.roi = Math.round(((rent * 12) / price) * 10000) / 100;
        property.valueToBid =
          auctionObj.currentBid > 0
            ? Math.round(((property.currentPrice - auctionObj.currentBid) / property.currentPrice) * 100)
            : null;
      }

      const uniqueBidderIds = [...new Set(auction.bids.map((b) => b.bidderId.toString()))];
      auctionObj.uniqueBidders = uniqueBidderIds.length;

      if (req.user) {
        const myUserId = req.user._id.toString();
        auctionObj.isWatching = auction.watchers.some((w) => (w._id?.toString() || w?.toString()) === myUserId);
        const myBids = auction.bids.filter((b) => b.bidderId.toString() === myUserId);
        auctionObj.myBidCount = myBids.length;
        auctionObj.myMaxBid = myBids.length > 0 ? Math.max(...myBids.map((b) => b.amount)) : 0;
        auctionObj.isWinning = auction.currentBidderId?._id?.toString() === myUserId;
      }

      return res.json({ success: true, auction: auctionObj });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.post(
  '/',
  authenticate,
  createRateLimit,
  [
    body('propertyId').isMongoId().withMessage('Invalid property ID'),
    body('auctionType').optional().isIn(['standard', 'reserve']),
    body('reservePrice').optional({ values: 'null' }).isFloat({ min: 0 }),
    body('duration').optional().isIn(['short', 'medium', 'long', 'extended']),
    body('startingBid').optional().isFloat({ min: 100 }),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const {
        propertyId,
        auctionType = 'standard',
        reservePrice = 0,
        duration = 'medium',
        startingBid: customStartingBid,
      } = req.body;
      const userId = req.user._id;

      const property = await Property.findById(propertyId);
      if (!property) {
        return res.status(404).json({ success: false, error: 'Property not found' });
      }

      if (property.ownerId?.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, error: 'You do not own this property' });
      }

      const existingAuction = await Auction.findOne({
        propertyId,
        status: { $in: ['upcoming', 'active'] },
      });
      if (existingAuction) {
        return res.status(400).json({ success: false, error: 'This property is already listed in an auction' });
      }

      const activeAuctions = await Auction.countDocuments({
        sellerId: userId,
        status: { $in: ['upcoming', 'active'] },
      });
      if (activeAuctions >= AUCTION_CONFIG.maxActiveAuctionsPerPlayer) {
        return res.status(400).json({
          success: false,
          error: `Maximum ${AUCTION_CONFIG.maxActiveAuctionsPerPlayer} active auctions allowed`,
        });
      }

      const listingFee = Math.floor(property.currentPrice * (AUCTION_CONFIG.playerListingFeePercent / 100));
      const user = await User.findById(userId);
      if (user.balance < listingFee) {
        return res.status(400).json({
          success: false,
          error: `Insufficient funds for listing fee ($${listingFee.toLocaleString()})`,
        });
      }

      user.balance -= listingFee;
      await user.save();

      const currentTick = await getTickNumber();
      const ticks = AUCTION_CONFIG.durations[duration] || AUCTION_CONFIG.durations.medium;
      const startingBid = customStartingBid || Math.floor(property.currentPrice * 0.7);
      const bidIncrement = Math.max(1000, Math.floor(startingBid * (AUCTION_CONFIG.minBidIncrementPercent / 100)));

      const auction = await Auction.create({
        propertyId,
        sellerId: userId,
        sellerType: 'player',
        auctionType,
        reservePrice: auctionType === 'reserve' ? reservePrice : 0,
        startingBid,
        currentBid: 0,
        currentBidderId: null,
        status: 'upcoming',
        startTick: currentTick + 1,
        endTick: currentTick + 1 + ticks,
        originalEndTick: currentTick + 1 + ticks,
        antiSnipingExtension: AUCTION_CONFIG.antiSnipingTicks,
        bidIncrement,
        activity: [
          {
            type: 'created',
            userId,
            username: user.username,
            message: `Auction created by ${user.username}`,
            tick: currentTick,
          },
        ],
      });

      property.forSale = false;
      await property.save();

      await processPlayerProgress(userId, 'auction_create');

      return res.status(201).json({
        success: true,
        auction: {
          _id: auction._id,
          propertyId: auction.propertyId,
          auctionType: auction.auctionType,
          startingBid: auction.startingBid,
          ...computeAuctionRemaining(auction, currentTick),
        },
        listingFee,
        balance: user.balance,
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

/**
 * One atomic attempt at placing a bid. Returns { retry: true } when the
 * auction changed concurrently (the reservation is rolled back and the caller
 * re-reads and retries), otherwise a response object.
 */
async function tryPlaceBid({ id, amount, userId, currentTick }) {
  const auction = await Auction.findById(id);
  if (!auction) return { status: 404, body: { success: false, error: 'Auction not found' } };

  if (auction.status !== 'active') {
    return { status: 400, body: { success: false, error: 'This auction is no longer active' } };
  }

  if (auction.endTick <= currentTick) {
    await resolveStuckAuction(auction._id).catch(() => {});
    return { status: 400, body: { success: false, error: 'This auction is no longer active' } };
  }

  if (auction.sellerId?.toString() === userId.toString()) {
    return { status: 400, body: { success: false, error: 'You cannot bid on your own property' } };
  }

  const minBid = auction.currentBid > 0 ? auction.currentBid + auction.bidIncrement : auction.startingBid;
  if (amount < minBid) {
    return { status: 400, body: { success: false, error: `Minimum bid is $${minBid.toLocaleString()}` } };
  }

  const user = await User.findById(userId);
  if (!user) return { status: 404, body: { success: false, error: 'User not found' } };

  // ── Money reservation (atomic, cannot double-spend) ───────────────
  const prevReservation = await AuctionReservation.findOne({ userId, auctionId: auction._id }).lean();
  const delta = Math.max(0, amount - (prevReservation?.amount || 0));

  const reservedUser = await reserveAuctionFunds(userId, delta);
  if (!reservedUser) {
    return {
      status: 400,
      body: { success: false, error: "You don't have enough available funds to place this bid" },
    };
  }

  // ── Optimistic auction update (guarded on currentBid/currentBidderId) ──
  const ticksRemaining = auction.endTick - currentTick;
  const extend = ticksRemaining <= AUCTION_CONFIG.antiSnipingThresholdTicks;
  const newEndTick = extend ? auction.endTick + auction.antiSnipingExtension : auction.endTick;

  const reserveMetNow = auction.auctionType === 'reserve' && !auction.reserveMet && amount >= auction.reservePrice;

  const uniqueBefore = new Set(auction.bids.map((b) => b.bidderId.toString()));
  const isNewBidder = !uniqueBefore.has(userId.toString());

  const activityEntries = [
    { type: 'bid', userId, username: user.username, amount, tick: currentTick, createdAt: new Date() },
  ];
  if (reserveMetNow) {
    activityEntries.push({
      type: 'reserve_met',
      message: `Reserve price reached at $${amount.toLocaleString()}`,
      tick: currentTick,
      createdAt: new Date(),
    });
  }

  const updated = await Auction.findOneAndUpdate(
    {
      _id: auction._id,
      status: 'active',
      currentBid: auction.currentBid,
      currentBidderId: auction.currentBidderId,
    },
    {
      $set: {
        currentBid: amount,
        currentBidderId: userId,
        reserveMet: auction.reserveMet || reserveMetNow,
        ...(extend ? { endTick: newEndTick } : {}),
      },
      $inc: { totalBids: 1 },
      $push: {
        bids: { bidderId: userId, amount, tick: currentTick, username: user.username, createdAt: new Date() },
        activity: { $each: activityEntries },
      },
    },
    { new: true },
  );

  if (!updated) {
    // Concurrent modification — roll back the reservation and retry
    await releaseAuctionFunds(userId, delta);
    return { retry: true };
  }

  // Recompute unique bidders from the fresh document (idempotent)
  const uniqueAfter = new Set(updated.bids.map((b) => b.bidderId.toString()));
  await Auction.updateOne({ _id: updated._id }, { $set: { uniqueBidders: uniqueAfter.size } });

  if (isNewBidder) {
    await Auction.updateOne(
      { _id: updated._id, watchers: { $ne: userId } },
      { $addToSet: { watchers: userId }, $inc: { watcherCount: 1 } },
    );
  }

  // Record the reservation (full new amount for this auction)
  await setAuctionReservation(userId, updated._id, amount);

  // ── Release the outbid user's reservation immediately ──────────────
  const previousBidderId = auction.currentBidderId;
  const wasOutbid = previousBidderId && previousBidderId.toString() !== userId.toString();
  if (wasOutbid) {
    // The outbid activity carries the previous bidder's real username so the
    // UI never falls back to a "System" label for a real player.
    const prevBid = [...auction.bids].reverse().find((b) => b.bidderId?.toString() === previousBidderId.toString());

    const outbidRes = await AuctionReservation.findOne({
      userId: previousBidderId,
      auctionId: updated._id,
    }).lean();
    if (outbidRes) {
      await releaseAuctionFunds(previousBidderId, outbidRes.amount);
      await AuctionReservation.deleteOne({ _id: outbidRes._id });
    }

    await enqueueNotification({
      userId: previousBidderId,
      type: 'system',
      title: 'Outbid!',
      message: `You have been outbid on an auction. New high bid: $${amount.toLocaleString()}`,
      eventKey: `auction:${updated._id}:outbid:${previousBidderId}`,
      route: `/auctions/${updated._id}`,
      entityType: 'auction',
      entityId: updated._id,
      relatedId: updated._id,
      global: false,
    });

    await Auction.updateOne(
      { _id: updated._id },
      {
        $push: {
          activity: {
            type: 'outbid',
            userId: previousBidderId,
            username: prevBid?.username,
            tick: currentTick,
            createdAt: new Date(),
          },
        },
      },
    );
  }

  if (extend) {
    emitAuctionExtended(updated._id.toString(), {
      newEndTick,
      extension: updated.antiSnipingExtension,
      currentTick,
      remainingMonths: Math.max(0, newEndTick - currentTick),
    });
    for (const watcherId of updated.watchers) {
      if (watcherId.toString() === userId.toString()) continue;
      await enqueueNotification({
        userId: watcherId,
        type: 'system',
        title: 'Auction Extended',
        message: `An auction you're watching was extended by ${updated.antiSnipingExtension} tick(s) due to last-minute bidding!`,
        eventKey: `auction:${updated._id}:extended:${watcherId}`,
        route: `/auctions/${updated._id}`,
        entityType: 'auction',
        entityId: updated._id,
        relatedId: updated._id,
        global: false,
      });
    }
  }

  if (reserveMetNow) {
    for (const watcherId of updated.watchers) {
      if (watcherId.toString() === userId.toString()) continue;
      await enqueueNotification({
        userId: watcherId,
        type: 'system',
        title: 'Reserve Price Reached',
        message: `The reserve price has been met on an auction you're watching!`,
        eventKey: `auction:${updated._id}:reserve_reached:${watcherId}`,
        route: `/auctions/${updated._id}`,
        entityType: 'auction',
        entityId: updated._id,
        relatedId: updated._id,
        global: false,
      });
    }
  }

  try {
    let rep = await AuctionReputation.findOne({ userId });
    if (!rep) rep = await AuctionReputation.create({ userId });
    rep.totalBidsPlaced += 1;
    rep.totalParticipations += isNewBidder ? 1 : 0;
    await rep.save();
  } catch {
    // reputation update is best-effort
  }

  const timing = computeAuctionRemaining(updated, currentTick);

  emitAuctionBid(updated._id.toString(), {
    currentBid: amount,
    currentBidderId: userId.toString(),
    currentBidderUsername: user.username,
    totalBids: updated.totalBids,
    uniqueBidders: uniqueAfter.size,
    endTick: updated.endTick,
    currentTick: timing.currentTick,
    remainingMonths: timing.remainingMonths,
  });

  emitAuctionActivity(updated._id.toString(), {
    type: 'bid',
    userId: userId.toString(),
    username: user.username,
    amount,
    tick: currentTick,
  });

  const cacheDeletes = [
    cacheDel(cacheKeys.auction(updated._id.toString())),
    cacheDel(cacheKeys.auctionFeatured()),
    cacheDel(cacheKeys.auctionAnalytics()),
    cacheDel(cacheKeys.auctionMyAnalytics(userId.toString())),
  ];
  if (wasOutbid) cacheDeletes.push(cacheDel(cacheKeys.auctionMyAnalytics(previousBidderId.toString())));
  await Promise.all(cacheDeletes);

  await processPlayerProgress(userId, 'auction_bid');

  return {
    status: 200,
    body: {
      success: true,
      auction: {
        _id: updated._id,
        currentBid: updated.currentBid,
        currentBidderId: userId.toString(),
        totalBids: updated.totalBids,
        uniqueBidders: uniqueAfter.size,
        endTick: updated.endTick,
        reserveMet: updated.reserveMet,
        currentTick: timing.currentTick,
        remainingMonths: timing.remainingMonths,
      },
      balance: reservedUser.balance,
      reservedAuctionFunds: reservedUser.reservedAuctionFunds || 0,
      availableBalance: (reservedUser.balance || 0) - (reservedUser.reservedAuctionFunds || 0),
    },
  };
}

router.post(
  '/:id/bid',
  authenticate,
  bidRateLimit,
  [
    param('id').isMongoId().withMessage('Invalid auction ID'),
    body('amount').isFloat({ min: 1 }).withMessage('Bid amount must be positive'),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { id } = req.params;
      const amount = Number(req.body.amount);
      const userId = req.user._id;
      const currentTick = await getTickNumber();

      // ── City ownership limit — checked before any money moves ──────
      const auctionRef = await Auction.findById(id).select('propertyId sellerId status endTick currentBidderId');
      if (!auctionRef) {
        return res.status(404).json({ success: false, error: 'Auction not found' });
      }
      const propertyRef = await Property.findById(auctionRef.propertyId).select('cityId').lean();
      const city = propertyRef?.cityId ? await City.findById(propertyRef.cityId) : null;
      if (city) {
        const limit = await getCityPropertyLimit(city);
        const { owned, potential } = await getCityOwnershipStats(userId, city._id);
        const alreadyWinningThis = auctionRef.currentBidderId?.toString() === userId.toString();
        const extra = alreadyWinningThis ? 0 : 1;

        if (owned >= limit) {
          return res.status(400).json({
            success: false,
            error: `You already control the maximum number of properties allowed in ${city.name}`,
          });
        }
        if (potential + extra > limit) {
          return res.status(400).json({
            success: false,
            error: `You cannot place this bid because winning this auction would exceed the property ownership limit for ${city.name}`,
          });
        }
      }

      let result;
      await withUserBidLock(userId, async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          result = await tryPlaceBid({ id, amount, userId, currentTick });
          if (!result.retry) return;
        }
        result = { status: 409, body: { success: false, error: 'Too many concurrent bids. Please try again.' } };
      });

      return res.status(result.status).json(result.body);
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.post(
  '/:id/watch',
  authenticate,
  [param('id').isMongoId().withMessage('Invalid auction ID'), handleValidationErrors],
  async (req, res) => {
    try {
      const auction = await Auction.findById(req.params.id);
      if (!auction) {
        return res.status(404).json({ success: false, error: 'Auction not found' });
      }

      const userId = req.user._id;
      const isWatching = auction.watchers.some((w) => w.toString() === userId.toString());

      if (isWatching) {
        await Auction.updateOne({ _id: auction._id }, { $pull: { watchers: userId }, $inc: { watcherCount: -1 } });
        await cacheDel(cacheKeys.auctionWatchlist(userId.toString()));
        return res.json({ success: true, watching: false });
      }

      if (auction.watchers.length >= AUCTION_CONFIG.maxWatchlistPerPlayer) {
        return res.status(400).json({ success: false, error: 'Watchlist is full' });
      }

      await Auction.updateOne({ _id: auction._id }, { $addToSet: { watchers: userId }, $inc: { watcherCount: 1 } });

      auction.activity.push({
        type: 'watched',
        userId,
        username: req.user.username,
        tick: await getTickNumber(),
      });
      await auction.save();
      await cacheDel(cacheKeys.auctionWatchlist(userId.toString()));

      return res.json({ success: true, watching: true });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.post(
  '/:id/cancel',
  authenticate,
  [param('id').isMongoId().withMessage('Invalid auction ID'), handleValidationErrors],
  async (req, res) => {
    try {
      const auction = await cancelAuction(req.params.id, req.user._id);
      await Promise.all([cacheDel(cacheKeys.auction(auction._id.toString())), cacheDel(cacheKeys.auctionFeatured())]);
      return res.json({
        success: true,
        auction: { _id: auction._id, status: auction.status },
      });
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
  },
);

router.post(
  '/:id/company-bid',
  authenticate,
  bidRateLimit,
  [
    param('id').isMongoId().withMessage('Invalid auction ID'),
    body('companyId').isMongoId().withMessage('Invalid company ID'),
    body('amount').isFloat({ min: 1 }).withMessage('Bid amount must be positive'),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { id } = req.params;
      const { companyId, amount } = req.body;
      const userId = req.user._id;

      const company = await RealEstateCompany.findById(companyId);
      if (!company) {
        return res.status(404).json({ success: false, error: 'Company not found' });
      }

      const member = company.members.find((m) => m.userId.toString() === userId.toString());
      if (!member) {
        return res.status(403).json({ success: false, error: 'Not a company member' });
      }

      if (!hasPermission(member, 'initiate_investments')) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      }

      const auction = await Auction.findById(id);
      if (!auction) {
        return res.status(404).json({ success: false, error: 'Auction not found' });
      }

      if (auction.status !== 'active') {
        return res.status(400).json({ success: false, error: 'Auction is not active' });
      }

      const currentTick = await getTickNumber();
      if (auction.endTick <= currentTick) {
        console.warn(
          `[COMPANY-BID] Rejected — auction ${id} endTick ${auction.endTick} <= currentTick ${currentTick}, status=${auction.status}`,
        );
        await resolveStuckAuction(auction._id);
        return res.status(400).json({ success: false, error: 'Auction has ended' });
      }

      const minBid = auction.currentBid > 0 ? auction.currentBid + auction.bidIncrement : auction.startingBid;
      if (amount < minBid) {
        return res.status(400).json({
          success: false,
          error: `Minimum bid is $${minBid.toLocaleString()}`,
        });
      }

      if (company.treasury.balance < amount) {
        return res.status(400).json({ success: false, error: 'Insufficient company treasury' });
      }

      const existingPending = company.auctionBids?.find(
        (r) => r.auctionId?.toString() === id && r.status === 'pending',
      );
      if (existingPending) {
        return res.status(400).json({ success: false, error: 'A pending bid proposal already exists' });
      }

      if (!company.auctionBids) company.auctionBids = [];

      const gameState = await getGameState();
      // Backend-computed voting deadline: MIN(now + 6h, auctionEndsAt).
      // Never supplied by the client. Guarantees voting cannot outlive the
      // auction (votingEndsAt <= auctionEndsAt always).
      const votingEndsAt = calculateAuctionBidVotingEndsAt(auction, gameState);
      company.auctionBids.push({
        auctionId: auction._id,
        amount,
        requestedBy: userId,
        status: 'pending',
        votes: [],
        votingEndsAt,
        createdTick: gameState.tickNumber || 0,
        createdAt: new Date(),
      });

      await company.save();
      const proposal = company.auctionBids[company.auctionBids.length - 1];
      scheduleAuctionBidResolution(company._id, proposal._id, votingEndsAt);

      const totalVoters = company.members.length - 1;
      for (const m of company.members) {
        if (m.userId?.toString() !== userId.toString()) {
          await enqueueNotification({
            userId: m.userId,
            type: 'system',
            title: 'Company Auction Bid Proposal',
            message: `${req.user.username} proposes bidding $${amount.toLocaleString()} on an auction. Vote now.`,
            eventKey: `auction:${auction._id}:company_bid_vote:${m.userId}`,
            route: `/real-estate-companies/${company._id}`,
            tab: 'auctions',
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            proposalId: proposal._id,
            auctionId: auction._id,
            global: false,
          });
        }
      }

      await CompanyAuditLog.create({
        companyId: company._id,
        userId,
        action: 'auction_bid_requested',
        details: { auctionId: auction._id, amount, votingEndsAt },
        tick: gameState.tickNumber,
      });

      await onCompanyVote(company._id);

      return res.status(201).json({
        success: true,
        message: 'Bid proposal created. Awaiting company vote.',
        proposalId: proposal._id,
        votingEndsAt,
        totalVoters,
        approvalThreshold: Math.ceil(totalVoters / 2),
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.post(
  '/:id/company-bid/:reqId/vote',
  authenticate,
  [
    param('id').isMongoId(),
    param('reqId').isMongoId(),
    body('vote').isIn(['yes', 'no']).withMessage('Vote must be yes or no'),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { reqId } = req.params;
      const { vote } = req.body;
      const userId = req.user._id;

      // The URL is nested under /auctions/:id — `id` is the auction id, not
      // the company id. The proposal is the canonical object; find the
      // company that owns it so the lookup never depends on a mis-sent id.
      const company = await RealEstateCompany.findOne({ 'auctionBids._id': reqId });
      if (!company) {
        return res.status(404).json({ success: false, error: 'Company not found' });
      }

      const member = company.members.find((m) => m.userId.toString() === userId.toString());
      if (!member) {
        return res.status(403).json({ success: false, error: 'Not a company member' });
      }

      const bidReq = company.auctionBids?.id(reqId);
      if (!bidReq) {
        return res.status(404).json({ success: false, error: 'Bid proposal not found' });
      }

      if (bidReq.status === 'expired') {
        return res.status(400).json({ success: false, error: 'Bid proposal has expired' });
      }

      if (bidReq.status !== 'pending') {
        return res.status(400).json({ success: false, error: 'Bid proposal is not pending' });
      }

      // Backend-computed voting deadline — never trust the client. Votes after
      // it are rejected (the deadline job resolves the proposal atomically).
      if (bidReq.votingEndsAt && new Date(bidReq.votingEndsAt).getTime() <= Date.now()) {
        return res.status(400).json({ success: false, error: 'Voting has ended' });
      }

      // Voting must NEVER continue after the auction itself ends.
      const auction = await Auction.findById(bidReq.auctionId);
      if (!auction) {
        return res.status(404).json({ success: false, error: 'Auction not found' });
      }
      const currentTick = await getTickNumber();
      if (auction.endTick <= currentTick) {
        return res.status(400).json({ success: false, error: 'Auction has ended' });
      }

      if (bidReq.requestedBy.toString() === userId.toString()) {
        return res.status(400).json({ success: false, error: 'Cannot vote on your own proposal' });
      }

      const existingVote = bidReq.votes.find((v) => v.userId.toString() === userId.toString());
      if (existingVote) {
        return res.status(400).json({ success: false, error: 'Already voted' });
      }

      bidReq.votes.push({ userId, vote, votedAt: new Date() });
      company.stats.totalVotes = (company.stats.totalVotes || 0) + 1;

      const gameState = await getGameState();
      await CompanyAuditLog.create({
        companyId: company._id,
        userId,
        action: 'auction_bid_vote_cast',
        details: { vote, auctionBidId: bidReq._id, auctionId: bidReq.auctionId },
        tick: gameState.tickNumber,
      });

      // Persist the vote before any resolution so the atomic claim in
      // resolveAuctionBidProposal reads a consistent document.
      await company.save();

      const totalVoters = company.members.filter((m) => m.userId?.toString() !== bidReq.requestedBy?.toString()).length;
      const votesInFavor = bidReq.votes.filter((v) => v.vote === 'yes').length;
      const threshold = Math.ceil(totalVoters / 2);
      const allVoted = bidReq.votes.length >= totalVoters;

      let resolution = null;
      // Resolve immediately when the outcome is already decided by explicit
      // votes (threshold reached, or every eligible voter has voted). The
      // atomic resolver claims the proposal so no other worker can resolve it.
      if (votesInFavor >= threshold || allVoted) {
        resolution = await resolveAuctionBidProposal(company._id, bidReq._id, { applyMissingAsYes: false });
      }

      const status = resolution?.claimed ? resolution.status : 'pending';

      return res.json({
        success: true,
        vote,
        status,
        votesInFavor,
        totalVoters,
        approvalThreshold: threshold,
        resolution,
        proposal: {
          _id: bidReq._id,
          status,
          votes: bidReq.votes,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.get('/reputation/:userId', async (req, res) => {
  try {
    const rep = await AuctionReputation.findOne({ userId: req.params.userId })
      .populate('userId', 'username avatar')
      .lean();

    return res.json({ success: true, reputation: rep || null });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get(
  '/history/list',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { limit = 20, offset = 0 } = req.query;

      const [auctions, total] = await Promise.all([
        Auction.find({ status: { $in: ['ended', 'ending'] } })
          .populate('propertyId', 'name type currentPrice')
          .populate('winnerId', 'username')
          .sort({ updatedAt: -1 })
          .skip(Number(offset))
          .limit(Number(limit))
          .lean(),
        Auction.countDocuments({ status: { $in: ['ended', 'ending'] } }),
      ]);

      return res.json({ success: true, auctions, total });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.get(
  '/my/bids',
  authenticate,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { limit = 20, offset = 0 } = req.query;
      const currentTick = await getTickNumber();

      const auctions = await Auction.find({
        'bids.bidderId': userId,
        status: { $in: ['active', 'ending', 'ended'] },
      })
        .populate('propertyId', 'name type currentPrice propertyRating')
        .sort({ updatedAt: -1 })
        .skip(Number(offset))
        .limit(Number(limit))
        .lean();

      const enriched = auctions.map((a) => ({
        ...a,
        ...computeAuctionRemaining(a, currentTick),
        isWinning: a.currentBidderId?.toString() === userId.toString(),
        myMaxBid: Math.max(...a.bids.filter((b) => b.bidderId.toString() === userId.toString()).map((b) => b.amount)),
      }));

      return res.json({ success: true, auctions: enriched });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.get('/my/analytics', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const cacheKey = cacheKeys.auctionMyAnalytics(userId.toString());
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json({ success: true, stats: cached });

    const [rep, participation, wonCount, watchlistCount, totalSpentAgg, activeWinning, userDoc] = await Promise.all([
      AuctionReputation.findOne({ userId }).lean(),
      Auction.countDocuments({ 'bids.bidderId': userId }),
      Auction.countDocuments({ winnerId: userId, winningBid: { $gt: 0 } }),
      Auction.countDocuments({ watchers: userId }),
      Auction.aggregate([
        { $match: { winnerId: userId, winningBid: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$winningBid' } } },
      ]),
      Auction.countDocuments({
        currentBidderId: userId,
        status: { $in: ['active', 'ending'] },
        winningBid: { $lte: 0 },
      }),
      User.findById(userId).select('balance reservedAuctionFunds').lean(),
    ]);

    const bidAgg = await Auction.aggregate([
      { $match: { 'bids.bidderId': userId } },
      { $unwind: '$bids' },
      { $match: { 'bids.bidderId': userId } },
      { $group: { _id: null, total: { $sum: '$bids.amount' }, count: { $sum: 1 } } },
    ]);
    const totalAmountBid = bidAgg[0]?.total || 0;
    const bidsPlaced = rep?.totalBidsPlaced || bidAgg[0]?.count || 0;
    const won = wonCount;
    const lost = Math.max(0, participation - won);

    const stats = {
      participation,
      bidsPlaced,
      won,
      lost,
      totalAmountBid,
      totalSpent: totalSpentAgg[0]?.total || 0,
      averageBid: bidsPlaced > 0 ? Math.round(totalAmountBid / bidsPlaced) : 0,
      winRate: participation > 0 ? Math.round((won / participation) * 100) : 0,
      watchlistCount,
      activeWinningBids: activeWinning,
      balance: userDoc?.balance || 0,
      reservedAuctionFunds: userDoc?.reservedAuctionFunds || 0,
      availableBalance: (userDoc?.balance || 0) - (userDoc?.reservedAuctionFunds || 0),
    };

    await cacheSet(cacheKey, stats, AUCTION_CONFIG.cacheTTL.analytics);
    return res.json({ success: true, stats });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/my/watchlist', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const currentTick = await getTickNumber();

    const cacheKey = cacheKeys.auctionWatchlist(userId.toString());
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json({ success: true, auctions: cached });

    const auctions = await Auction.find({
      watchers: userId,
      status: { $in: ['upcoming', 'active'] },
    })
      .populate('propertyId', 'name type currentPrice propertyRating condition')
      .populate('currentBidderId', 'username')
      .sort({ endTick: 1 })
      .lean();

    const enriched = auctions.map((a) => ({
      ...a,
      ...computeAuctionRemaining(a, currentTick),
      isWinning: a.currentBidderId?._id?.toString() === userId.toString(),
    }));

    await cacheSet(cacheKey, enriched, AUCTION_CONFIG.cacheTTL.watchlist);
    return res.json({ success: true, auctions: enriched });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
