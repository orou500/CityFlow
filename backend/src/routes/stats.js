import { Router } from 'express';
import User from '../models/User.js';
import Property from '../models/Property.js';
import City from '../models/City.js';
import Transaction from '../models/Transaction.js';
import Auction from '../models/Auction.js';
import MissionProgress from '../models/MissionProgress.js';
import CompanyAuditLog from '../models/CompanyAuditLog.js';
import { cacheGetOrSet } from '../utils/cache.js';
import { cacheKeys } from '../utils/cacheKeys.js';
import { getMissionById } from '../config/missions.js';

const router = Router();

const STATS_TTL = 60;

/**
 * Transaction types that represent genuine player activity. Bank/system
 * bookkeeping (login, penalties, repossessions, loan auto-payments, period
 * bonuses) is never shown in the public feed.
 */
const PLAYER_ACTIVITY_TYPES = [
  'buy',
  'sell',
  'rent',
  'construction',
  'upgrade',
  'grade_upgrade',
  'improvement',
  'development',
  'loan',
  'loan_repay',
  'season_reward',
];

/** Major company actions worth showing in the community feed. */
const COMPANY_ACTIVITY_ACTIONS = [
  'company_created',
  'ipo_listed',
  'milestone_completed',
  'contract_completed',
  'employees_hired',
];

router.get('/', async (req, res) => {
  try {
    const data = await cacheGetOrSet(
      cacheKeys.stats(),
      async () => {
        const [playersCount, propertiesCount, citiesCount, transactionsCount] = await Promise.all([
          User.countDocuments(),
          Property.countDocuments(),
          City.countDocuments(),
          Transaction.countDocuments(),
        ]);

        const topPlayers = await User.aggregate([
          { $lookup: { from: 'properties', localField: '_id', foreignField: 'ownerId', as: 'props' } },
          { $addFields: { portfolioValue: { $sum: '$props.currentPrice' } } },
          { $addFields: { netWorth: { $add: ['$balance', '$portfolioValue'] } } },
          { $sort: { netWorth: -1 } },
          { $limit: 10 },
          { $project: { username: 1, displayName: 1, avatar: 1, netWorth: 1, balance: 1 } },
        ]);

        // ── Global Activity: real players only ────────────────────────
        // Meaningful transaction types, non-zero amounts, at least one real
        // player actor (bank/system transfers have no buyerId/sellerId).
        const [playerTxs, companyPurchases, auctionWins, missionCompletions, companyEvents] = await Promise.all([
          Transaction.find({
            type: { $in: PLAYER_ACTIVITY_TYPES },
            price: { $gt: 0 },
            $or: [{ buyerId: { $ne: null } }, { sellerId: { $ne: null } }],
          })
            .sort({ createdAt: -1 })
            .limit(8)
            .populate('propertyId', 'name cityId')
            .populate('buyerId', 'username displayName')
            .populate('sellerId', 'username displayName')
            .populate('companyId', 'name')
            .lean(),
          // Company property purchases (no personal buyer/seller) are their own
          // activity type — never attributed to a player.
          Transaction.find({
            type: 'buy',
            companyId: { $ne: null },
            propertyId: { $ne: null },
          })
            .sort({ createdAt: -1 })
            .limit(4)
            .populate('propertyId', 'name cityId')
            .populate('companyId', 'name')
            .lean(),
          Auction.find({ status: 'ended', winnerId: { $ne: null }, winningBid: { $gt: 0 } })
            .sort({ updatedAt: -1 })
            .limit(4)
            .populate('winnerId', 'username displayName')
            .populate('propertyId', 'name cityId')
            .lean(),
          MissionProgress.find({ status: 'completed', completedAt: { $ne: null } })
            .sort({ completedAt: -1 })
            .limit(4)
            .populate('userId', 'username displayName')
            .lean(),
          CompanyAuditLog.find({ action: { $in: COMPANY_ACTIVITY_ACTIONS }, userId: { $ne: null } })
            .sort({ createdAt: -1 })
            .limit(4)
            .populate('userId', 'username displayName')
            .populate('companyId', 'name')
            .lean(),
        ]);

        const activities = [];

        for (const tx of playerTxs) {
          // Company treasury contributions are recorded in the ledger as a
          // Transaction with type 'buy' but NO propertyId (the money goes into
          // the company, not a property). Classify them as
          // `company_funds_contributed` so they can never render as a property
          // purchase. Any other buy/sell row without a propertyId and without a
          // company is not a real property transaction — skip it entirely.
          const isCompanyContribution = tx.type === 'buy' && tx.companyId && !tx.propertyId;
          if ((tx.type === 'buy' || tx.type === 'sell') && !tx.propertyId && !tx.companyId) {
            continue;
          }
          activities.push({
            _id: tx._id,
            type: isCompanyContribution ? 'company_funds_contributed' : tx.type,
            createdAt: tx.createdAt,
            price: tx.price,
            buyerId: tx.buyerId,
            sellerId: tx.sellerId,
            propertyId: tx.propertyId,
            ...(isCompanyContribution ? { company: tx.companyId } : {}),
          });
        }

        for (const tx of companyPurchases) {
          activities.push({
            _id: tx._id,
            type: 'company_property_purchase',
            createdAt: tx.createdAt,
            price: tx.price,
            company: tx.companyId,
            propertyId: tx.propertyId,
          });
        }

        for (const a of auctionWins) {
          activities.push({
            _id: a._id,
            type: 'auction_won',
            createdAt: a.updatedAt || a.createdAt,
            price: a.winningBid,
            buyerId: a.winnerId,
            propertyId: a.propertyId,
          });
        }

        for (const m of missionCompletions) {
          const def = m.missionId ? getMissionById(m.missionId) : null;
          activities.push({
            _id: m._id,
            type: 'mission_completed',
            createdAt: m.completedAt,
            price: null,
            buyerId: m.userId,
            missionName: def?.name || m.missionId,
          });
        }

        for (const e of companyEvents) {
          activities.push({
            _id: e._id,
            type: 'company_event',
            createdAt: e.createdAt,
            price: null,
            buyerId: e.userId,
            company: e.companyId,
            companyAction: e.action,
          });
        }

        activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const recentActivity = activities.slice(0, 15);

        return { playersCount, propertiesCount, citiesCount, transactionsCount, topPlayers, recentActivity };
      },
      STATS_TTL,
    );

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
