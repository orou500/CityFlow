import express from 'express';
import mongoose from 'mongoose';
import { body, param, query, validationResult } from 'express-validator';
import Auction from '../models/Auction.js';
import AuctionReputation from '../models/AuctionReputation.js';
import Property from '../models/Property.js';
import User from '../models/User.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import { authenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { AUCTION_CONFIG } from '../config/auctions.js';
import { processPlayerProgress } from '../utils/playerProgress.js';
import {
  processAntiSniping,
  cancelAuction,
  getAuctionStats,
  emitAuctionBid,
  emitAuctionActivity,
  resolveStuckAuction,
} from '../engine/auctionProcessing.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import { cacheGet, cacheSet, cacheDel } from '../utils/cache.js';
import { cacheKeys } from '../utils/cacheKeys.js';

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
    const currentTick = global.currentTick || 0;

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
      const ticksRemaining = Math.max(0, a.endTick - currentTick);
      const isEndingSoon = ticksRemaining <= sc.endingSoonBonus && ticksRemaining > 0;
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
        currentTick,
        ticksRemaining,
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
      const currentTick = global.currentTick || 0;

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

      pipeline.push({
        $addFields: {
          currentTick,
          ticksRemaining: { $max: [0, { $subtract: ['$endTick', currentTick] }] },
        },
      });

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
          currentTick: 1,
          ticksRemaining: 1,
          'property._id': 1,
          'property.name': 1,
          'property.type': 1,
          'property.currentPrice': 1,
          'property.condition': 1,
          'property.propertyRating': 1,
        },
      });

      const auctions = await Auction.aggregate(pipeline);

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

      const currentTick = global.currentTick || 0;
      const auctionObj = auction.toJSON();
      auctionObj.currentTick = currentTick;
      auctionObj.ticksRemaining = Math.max(0, auction.endTick - currentTick);

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
        auctionObj.isWatching = auction.watchers.some(
          (w) => (w._id?.toString() || w?.toString()) === req.user._id.toString(),
        );
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

      const currentTick = global.currentTick || 0;
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
          status: auction.status,
          startTick: auction.startTick,
          endTick: auction.endTick,
        },
        listingFee,
        balance: user.balance,
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

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
      const { amount } = req.body;
      const userId = req.user._id;

      const auction = await Auction.findById(id);
      if (!auction) {
        return res.status(404).json({ success: false, error: 'Auction not found' });
      }

      if (auction.status !== 'active') {
        return res.status(400).json({ success: false, error: 'Auction is not active' });
      }

      const currentTick = global.currentTick || 0;
      if (auction.endTick <= currentTick) {
        await resolveStuckAuction(auction._id);
        return res.status(400).json({ success: false, error: 'Auction has ended' });
      }

      if (auction.sellerId?.toString() === userId.toString()) {
        return res.status(400).json({ success: false, error: 'Cannot bid on your own auction' });
      }

      const minBid = auction.currentBid > 0 ? auction.currentBid + auction.bidIncrement : auction.startingBid;

      if (amount < minBid) {
        return res.status(400).json({
          success: false,
          error: `Minimum bid is $${minBid.toLocaleString()}`,
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      if (user.balance < amount) {
        return res.status(400).json({ success: false, error: 'Insufficient funds' });
      }

      const previousBidderId = auction.currentBidderId;
      const wasReserveMet = auction.reserveMet;

      const uniqueBefore = new Set(auction.bids.map((b) => b.bidderId.toString()));
      const isNewBidder = !uniqueBefore.has(userId.toString());

      auction.bids.push({
        bidderId: userId,
        amount,
        tick: currentTick,
        username: user.username,
      });
      auction.currentBid = amount;
      auction.currentBidderId = userId;
      auction.totalBids += 1;

      const uniqueAfter = new Set(auction.bids.map((b) => b.bidderId.toString()));
      auction.uniqueBidders = uniqueAfter.size;

      auction.activity.push({
        type: 'bid',
        userId,
        username: user.username,
        amount,
        tick: currentTick,
      });

      if (isNewBidder) {
        await Auction.updateOne(
          { _id: auction._id, watchers: { $ne: userId } },
          { $addToSet: { watchers: userId }, $inc: { watcherCount: 1 } },
        );
      }

      await processAntiSniping(auction);

      if (auction.auctionType === 'reserve' && !wasReserveMet && amount >= auction.reservePrice) {
        auction.reserveMet = true;
        auction.activity.push({
          type: 'reserve_met',
          message: `Reserve price reached at $${amount.toLocaleString()}`,
          tick: currentTick,
        });

        for (const watcherId of auction.watchers) {
          if (watcherId.toString() !== userId.toString()) {
            await enqueueNotification({
              userId: watcherId,
              type: 'system',
              title: 'Reserve Price Reached',
              message: `The reserve price has been met on an auction you're watching!`,
              route: `/auctions/${auction._id}`,
              entityType: 'auction',
              entityId: auction._id,
              relatedId: auction._id,
              global: false,
            });
          }
        }
      }

      await auction.save();

      if (previousBidderId && previousBidderId.toString() !== userId.toString()) {
        await enqueueNotification({
          userId: previousBidderId,
          type: 'system',
          title: 'Outbid!',
          message: `You have been outbid on an auction. New high bid: $${amount.toLocaleString()}`,
          route: `/auctions/${auction._id}`,
          entityType: 'auction',
          entityId: auction._id,
          relatedId: auction._id,
          global: false,
        });

        auction.activity.push({
          type: 'outbid',
          userId: previousBidderId,
          tick: currentTick,
        });
      }

      try {
        let rep = await AuctionReputation.findOne({ userId });
        if (!rep) {
          rep = await AuctionReputation.create({ userId });
        }
        rep.totalBidsPlaced += 1;
        rep.totalParticipations += isNewBidder ? 1 : 0;
        await rep.save();
      } catch {
        // reputation update is best-effort
      }

      emitAuctionBid(auction._id.toString(), {
        currentBid: amount,
        currentBidderId: userId.toString(),
        currentBidderUsername: user.username,
        totalBids: auction.totalBids,
        uniqueBidders: auction.uniqueBidders,
        endTick: auction.endTick,
      });

      emitAuctionActivity(auction._id.toString(), {
        type: 'bid',
        userId: userId.toString(),
        username: user.username,
        amount,
        tick: currentTick,
      });

      await Promise.all([
        cacheDel(cacheKeys.auction(auction._id.toString())),
        cacheDel(cacheKeys.auctionFeatured()),
        cacheDel(cacheKeys.auctionAnalytics()),
      ]);

      await processPlayerProgress(userId, 'auction_bid');

      return res.json({
        success: true,
        auction: {
          _id: auction._id,
          currentBid: auction.currentBid,
          currentBidderId: userId.toString(),
          totalBids: auction.totalBids,
          uniqueBidders: auction.uniqueBidders,
          endTick: auction.endTick,
          reserveMet: auction.reserveMet,
        },
        balance: user.balance,
      });
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
        tick: global.currentTick || 0,
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

      if (!hasPermission(member.role, 'initiate_investments')) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      }

      const auction = await Auction.findById(id);
      if (!auction) {
        return res.status(404).json({ success: false, error: 'Auction not found' });
      }

      if (auction.status !== 'active') {
        return res.status(400).json({ success: false, error: 'Auction is not active' });
      }

      const currentTick = global.currentTick || 0;
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

      company.auctionBids.push({
        auctionId: auction._id,
        amount,
        requestedBy: userId,
        status: 'pending',
        votes: [],
        createdAt: new Date(),
      });

      await company.save();

      const totalVoters = company.members.length - 1;
      const directors = company.members.filter((m) => m.role === 'ceo' || m.role === 'director');
      for (const d of directors) {
        if (d.userId.toString() !== userId.toString()) {
          await enqueueNotification({
            userId: d.userId,
            type: 'system',
            title: 'Company Auction Bid Proposal',
            message: `${req.user.username} proposes bidding $${amount.toLocaleString()} on an auction. Vote now.`,
            route: `/real-estate-companies/${company._id}`,
            tab: 'overview',
            entityType: 'company',
            entityId: company._id,
            relatedId: company._id,
            global: false,
          });
        }
      }

      return res.status(201).json({
        success: true,
        message: 'Bid proposal created. Awaiting company vote.',
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
      const { id, reqId } = req.params;
      const { vote } = req.body;
      const userId = req.user._id;

      const company = await RealEstateCompany.findById(id);
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

      if (bidReq.status !== 'pending') {
        return res.status(400).json({ success: false, error: 'Bid proposal is not pending' });
      }

      if (bidReq.requestedBy.toString() === userId.toString()) {
        return res.status(400).json({ success: false, error: 'Cannot vote on your own proposal' });
      }

      const existingVote = bidReq.votes.find((v) => v.userId.toString() === userId.toString());
      if (existingVote) {
        return res.status(400).json({ success: false, error: 'Already voted' });
      }

      bidReq.votes.push({ userId, vote, votedAt: new Date() });

      const totalVoters = company.members.length - 1;
      const votesInFavor = bidReq.votes.filter((v) => v.vote === 'yes').length;

      if (votesInFavor >= Math.ceil(totalVoters / 2)) {
        bidReq.status = 'approved';

        const auction = await Auction.findById(bidReq.auctionId);
        if (auction && auction.status === 'active') {
          const currentTick = global.currentTick || 0;
          const minBid = auction.currentBid > 0 ? auction.currentBid + auction.bidIncrement : auction.startingBid;

          if (bidReq.amount >= minBid && company.treasury.balance >= bidReq.amount) {
            const previousBidderId = auction.currentBidderId;

            auction.bids.push({
              bidderId: userId,
              amount: bidReq.amount,
              tick: currentTick,
              username: `${company.name} (Company)`,
            });
            auction.currentBid = bidReq.amount;
            auction.currentBidderId = userId;
            auction.totalBids += 1;
            auction.companyId = company._id;

            const uniqueAfter = new Set(auction.bids.map((b) => b.bidderId.toString()));
            auction.uniqueBidders = uniqueAfter.size;

            auction.activity.push({
              type: 'bid',
              userId,
              username: `${company.name} (Company)`,
              amount: bidReq.amount,
              tick: currentTick,
            });

            company.treasury.balance -= bidReq.amount;
            company.treasury.transactions.push({
              type: 'withdrawal',
              amount: bidReq.amount,
              description: `Auction bid on property`,
              performedBy: userId,
            });

            await Promise.all([auction.save(), company.save()]);

            if (previousBidderId && previousBidderId.toString() !== userId.toString()) {
              await enqueueNotification({
                userId: previousBidderId,
                type: 'system',
                title: 'Outbid by Company',
                message: `${company.name} bid $${bidReq.amount.toLocaleString()} on an auction`,
                route: `/auctions/${auction._id}`,
                entityType: 'auction',
                entityId: auction._id,
                relatedId: auction._id,
                global: false,
              });
            }

            emitAuctionBid(auction._id.toString(), {
              currentBid: bidReq.amount,
              currentBidderId: userId.toString(),
              currentBidderUsername: `${company.name} (Company)`,
              totalBids: auction.totalBids,
              uniqueBidders: auction.uniqueBidders,
              endTick: auction.endTick,
            });
          }
        }
      } else if (totalVoters - bidReq.votes.length === 0) {
        bidReq.status = 'rejected';
      }

      if (bidReq.status === 'approved' || bidReq.status === 'rejected') {
        await enqueueNotification({
          userId: bidReq.requestedBy,
          type: 'system',
          title: bidReq.status === 'approved' ? 'Company Bid Approved' : 'Company Bid Rejected',
          message:
            bidReq.status === 'approved'
              ? `Your company auction bid proposal for $${bidReq.amount.toLocaleString()} was approved and executed.`
              : `Your company auction bid proposal for $${bidReq.amount.toLocaleString()} was rejected.`,
          route: `/real-estate-companies/${company._id}`,
          tab: 'overview',
          entityType: 'company',
          entityId: company._id,
          relatedId: company._id,
          global: false,
        });
      }

      await company.save();

      return res.json({
        success: true,
        vote,
        status: bidReq.status,
        votesInFavor,
        totalVoters,
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
      const currentTick = global.currentTick || 0;

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
        currentTick,
        ticksRemaining: Math.max(0, a.endTick - currentTick),
        isWinning: a.currentBidderId?.toString() === userId.toString(),
        myMaxBid: Math.max(...a.bids.filter((b) => b.bidderId.toString() === userId.toString()).map((b) => b.amount)),
      }));

      return res.json({ success: true, auctions: enriched });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.get('/my/watchlist', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const currentTick = global.currentTick || 0;

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
      currentTick,
      ticksRemaining: Math.max(0, a.endTick - currentTick),
      isWinning: a.currentBidderId?._id?.toString() === userId.toString(),
    }));

    await cacheSet(cacheKey, enriched, AUCTION_CONFIG.cacheTTL.watchlist);
    return res.json({ success: true, auctions: enriched });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
