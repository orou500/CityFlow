import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Property from '../models/Property.js';
import City from '../models/City.js';
import Transaction from '../models/Transaction.js';
import Event from '../models/Event.js';
import Loan from '../models/Loan.js';
import Season from '../models/Season.js';
import Notification from '../models/Notification.js';
import ConstructionProject from '../models/ConstructionProject.js';
import { getGameState } from '../models/GameState.js';
import { requireAdmin } from '../middleware/admin.js';
import { executeTick } from '../engine/tick.js';
import { DEVELOPMENT_PROJECTS } from '../config/developmentProjects.js';
import { clampMonthlyRent } from '../config/propertyManagement.js';
import { getCurrentSeason, endCurrentSeasonAndStartNew, createNewSeason } from '../engine/seasonReset.js';
import { setMaintenanceMode, getMaintenanceInfo } from '../models/GameState.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import { xpRequiredForLevel, xpRequiredForNextLevel } from '../config/companyProgression.js';
import { getXpForLevel } from '../utils/leveling.js';
import { sendEmail, verifyConnection } from '../services/email.js';
import emailTemplates from '../services/emailTemplates.js';
import { sendDiscordNotification } from '../services/discordBot.js';
import AdminAuditLog from '../models/AdminAuditLog.js';
import StockTransaction from '../models/StockTransaction.js';
import LeaderboardReward from '../models/LeaderboardReward.js';
import CompanyAuditLog from '../models/CompanyAuditLog.js';
import Auction from '../models/Auction.js';

const router = Router();

router.use(requireAdmin);

async function logAdminAction(req, action, targetUser, details = {}) {
  try {
    await AdminAuditLog.create({
      adminId: req.user._id,
      adminUsername: req.user.username,
      action,
      targetUserId: targetUser?._id || targetUser || null,
      targetUsername: targetUser?.username || '',
      details,
    });
  } catch (err) {
    console.error('[AdminAudit] Log error:', err.message);
  }
}

function stripSensitiveUserFields(userDoc) {
  const obj = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  delete obj.password;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.verificationToken;
  delete obj.verificationExpires;
  delete obj.pushTokens;
  delete obj.discordId;
  if (obj.oauthProviders) {
    obj.oauthProviders = obj.oauthProviders.map((p) => ({ provider: p.provider }));
  }
  return obj;
}

router.get('/overview', async (req, res) => {
  try {
    const [
      users,
      cities,
      properties,
      transactions,
      events,
      loans,
      constructionProjects,
      gameState,
      balanceResult,
      propertyValueResult,
    ] = await Promise.all([
      User.countDocuments(),
      City.countDocuments(),
      Property.countDocuments(),
      Transaction.countDocuments(),
      Event.countDocuments({ active: true }),
      Loan.countDocuments({ active: true }),
      ConstructionProject.countDocuments({ status: 'under_construction' }),
      getGameState(),
      User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
      Property.aggregate([{ $group: { _id: null, total: { $sum: '$currentPrice' } } }]),
    ]);

    const totalBalance = balanceResult[0]?.total || 0;
    const totalPropertyValue = propertyValueResult[0]?.total || 0;

    res.json({
      totalUsers: users,
      totalCities: cities,
      totalProperties: properties,
      totalTransactions: transactions,
      activeEvents: events,
      activeLoans: loans,
      activeConstructionProjects: constructionProjects,
      totalMoneyInCirculation: totalBalance + totalPropertyValue,
      tickNumber: gameState.tickNumber,
      lastTickAt: gameState.lastTickAt,
      lastTickDuration: gameState.lastTickDuration,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ticks', async (req, res) => {
  try {
    const gameState = await getGameState();
    const now = new Date();
    const hours = [0, 6, 12, 18];
    let nextTickAt = null;
    for (const h of hours) {
      const candidate = new Date(now);
      candidate.setHours(h, 0, 0, 0);
      if (candidate > now) {
        nextTickAt = candidate;
        break;
      }
    }
    if (!nextTickAt) {
      nextTickAt = new Date(now);
      nextTickAt.setDate(nextTickAt.getDate() + 1);
      nextTickAt.setHours(hours[0], 0, 0, 0);
    }
    res.json({
      tickNumber: gameState.tickNumber,
      lastTickAt: gameState.lastTickAt,
      nextTickAt,
      tickIntervalMinutes: 360,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tick/run', async (req, res) => {
  try {
    const { count = 1 } = req.body;
    const maxTicks = Math.min(Math.max(1, count), 50);
    const results = [];
    for (let i = 0; i < maxTicks; i++) {
      const result = await executeTick();
      results.push(result);
    }
    res.json({ ticksExecuted: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const { search, role, deleted, page = 1, limit = 25, sort = 'createdAt', order = 'desc' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    const filter = {};
    if (deleted === 'true' || deleted === '1') {
      filter.deletedAt = { $ne: null };
    }
    if (search) {
      const regex = { $regex: String(search).trim(), $options: 'i' };
      filter.$or = [{ username: regex }, { email: regex }, { normalizedUsername: regex }];
    }
    if (role && ['user', 'admin'].includes(role)) {
      filter.role = role;
    }

    const allowedSorts = ['username', 'email', 'role', 'balance', 'level', 'createdAt', 'banned', 'lastLoginAt'];
    const sortKey = allowedSorts.includes(sort) ? sort : 'createdAt';
    const sortOpts = { [sortKey]: order === 'asc' ? 1 : -1 };

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('+deletedAt')
        .sort(sortOpts)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      User.countDocuments(filter),
    ]);

    const ids = users.map((u) => u._id);
    const propCounts =
      ids.length > 0
        ? await Property.aggregate([
            { $match: { ownerId: { $in: ids } } },
            { $group: { _id: '$ownerId', count: { $sum: 1 } } },
          ])
        : [];
    const propCountMap = new Map(propCounts.map((p) => [p._id?.toString(), p.count]));

    const result = users.map((u) => ({
      ...stripSensitiveUserFields(u),
      propertyCount: propCountMap.get(u._id.toString()) || 0,
    }));

    res.json({ users: result, total, page: pageNum, totalPages: Math.ceil(total / limitNum), limit: limitNum });
  } catch (err) {
    console.error('[Admin Users] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('+deletedAt');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const propertyCount = await Property.countDocuments({ ownerId: user._id });
    const stockCount = await StockTransaction.countDocuments({ userId: user._id });
    const transactionCount = await Transaction.countDocuments({
      $or: [{ buyerId: user._id }, { sellerId: user._id }],
    });

    res.json({
      user: {
        ...stripSensitiveUserFields(user),
        propertyCount,
        stockCount,
        transactionCount,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── USER ACTIVITY LOG (admin-only) ────────────────────────────
// Aggregated from existing systems — no duplicate logging.

const TX_CATEGORY_MAP = {
  buy: 'market',
  sell: 'market',
  penalty: 'market',
  repossess: 'market',
  rent: 'rent',
  loan: 'loans',
  loan_payment: 'loans',
  loan_repay: 'loans',
  construction: 'development',
  upgrade: 'development',
  grade_upgrade: 'development',
  improvement: 'development',
  development: 'development',
  period_bonus: 'income',
  season_reward: 'season',
  login: 'auth',
};

const TX_ACTION_LABEL = {
  buy: 'Property purchased',
  sell: 'Property sold',
  penalty: 'Penalty charged',
  repossess: 'Property repossessed',
  rent: 'Rent collected',
  loan: 'Loan taken',
  loan_payment: 'Loan payment',
  loan_repay: 'Loan repaid',
  construction: 'Construction',
  upgrade: 'Property upgraded',
  grade_upgrade: 'Property graded',
  improvement: 'Property improved',
  development: 'Development',
  period_bonus: 'Period bonus',
  season_reward: 'Season leaderboard reward',
  login: 'Logged in',
};

router.get('/users/:id/activity', async (req, res) => {
  try {
    const { category, from, to, search, page = 1, limit = 50 } = req.query;
    const userId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const user = await User.findById(userId).select('_id username createdAt').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);
    const timeQuery = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};
    const CAP = 500;

    const CATEGORY_TX_TYPES = category
      ? Object.entries(TX_CATEGORY_MAP)
          .filter(([, cat]) => cat === category)
          .map(([type]) => type)
      : null;

    const logs = [];

    // Transactions (market/rent/loans/development/income/season/auth)
    const txFilter = {
      $or: [{ buyerId: userId }, { sellerId: userId }],
      ...timeQuery,
    };
    if (CATEGORY_TX_TYPES) {
      if (CATEGORY_TX_TYPES.length === 0) {
        txFilter.type = { $in: [] }; // category has no transaction types (e.g. stock)
      } else {
        txFilter.type = { $in: CATEGORY_TX_TYPES };
      }
    }
    const txns = await Transaction.find(txFilter).sort({ createdAt: -1 }).limit(CAP).lean();
    for (const t of txns) {
      logs.push({
        id: `tx:${t._id}`,
        timestamp: t.createdAt,
        category: TX_CATEGORY_MAP[t.type] || 'account',
        action: t.type,
        description: TX_ACTION_LABEL[t.type] || t.type,
        amount: t.price || 0,
        entityType: 'property',
        entityId: t.propertyId || null,
        actor: 'user',
        source: 'transaction',
      });
    }

    // Stock transactions
    if (!category || category === 'stock') {
      const stockTx = await StockTransaction.find({ userId, ...timeQuery })
        .sort({ createdAt: -1 })
        .limit(CAP)
        .lean();
      for (const t of stockTx) {
        logs.push({
          id: `stock:${t._id}`,
          timestamp: t.createdAt,
          category: 'stock',
          action: `stock_${t.type}`,
          description: t.type === 'buy' ? 'Bought shares' : t.type === 'sell' ? 'Sold shares' : 'Dividend received',
          amount: t.total || 0,
          entityType: 'company',
          entityId: t.companyId || null,
          actor: 'user',
          source: 'stock',
        });
      }
    }

    // Notifications (missions / achievements / career / system)
    if (!category || ['missions', 'achievements', 'career', 'company', 'season', 'account'].includes(category)) {
      const notifCategoryMap = {
        mission: 'missions',
        achievement: 'achievements',
        career: 'career',
        season: 'season',
        company: 'company',
      };
      const notifFilter = { userId, ...timeQuery };
      if (category) {
        const mapped = Object.entries(notifCategoryMap).find(([, cat]) => cat === category);
        notifFilter.entityType = mapped ? mapped[0] : { $exists: true };
      }
      const notifs = await Notification.find(notifFilter).sort({ createdAt: -1 }).limit(CAP).lean();
      for (const n of notifs) {
        logs.push({
          id: `notif:${n._id}`,
          timestamp: n.createdAt,
          category: notifCategoryMap[n.entityType] || 'account',
          action: `notification:${n.type}`,
          description: `${n.title} — ${n.message}`,
          amount: null,
          entityType: n.entityType || 'notification',
          entityId: n.entityId || n.relatedId || null,
          actor: 'system',
          source: 'notification',
        });
      }
    }

    // Company audit logs
    if (!category || category === 'company') {
      const companyLogs = await CompanyAuditLog.find({ userId, ...timeQuery })
        .sort({ createdAt: -1 })
        .limit(CAP)
        .lean();
      for (const l of companyLogs) {
        logs.push({
          id: `company:${l._id}`,
          timestamp: l.createdAt,
          category: 'company',
          action: l.action,
          description: l.action.replace(/_/g, ' '),
          amount: null,
          entityType: 'company',
          entityId: l.companyId || null,
          actor: 'user',
          source: 'company',
        });
      }
    }

    // Season leaderboard rewards
    if (!category || category === 'season') {
      const rewards = await LeaderboardReward.find({ userId, ...timeQuery })
        .sort({ createdAt: -1 })
        .limit(CAP)
        .lean();
      for (const r of rewards) {
        logs.push({
          id: `season:${r._id}`,
          timestamp: r.distributedAt || r.createdAt,
          category: 'season',
          action: 'season_reward',
          description: `Season ${r.seasonNumber} leaderboard reward — rank #${r.rank}`,
          amount: r.reward || 0,
          entityType: 'season',
          entityId: r.seasonId || null,
          actor: 'system',
          source: 'season',
        });
      }
    }

    // Admin actions affecting the user
    if (!category || category === 'admin') {
      const adminLogs = await AdminAuditLog.find({ targetUserId: userId, ...timeQuery })
        .sort({ createdAt: -1 })
        .limit(CAP)
        .lean();
      for (const l of adminLogs) {
        logs.push({
          id: `admin:${l._id}`,
          timestamp: l.createdAt,
          category: 'admin',
          action: l.action,
          description: `${l.action.replace(/_/g, ' ')}${l.adminUsername ? ` (by ${l.adminUsername})` : ''}`,
          amount: l.details?.amount ?? null,
          entityType: 'user',
          entityId: userId,
          actor: 'admin',
          source: 'admin',
        });
      }
    }

    // Auction activity (bids + wins)
    if (!category || category === 'auction') {
      const auctions = await Auction.find({ $or: [{ 'bids.bidderId': userId }, { winnerId: userId }], ...timeQuery })
        .select('_id bids winnerId winningBid status propertyId')
        .sort({ createdAt: -1 })
        .limit(CAP)
        .lean();
      for (const a of auctions) {
        for (const bid of a.bids || []) {
          if (bid.bidderId?.toString() !== userId) continue;
          if (dateFilter.$gte && bid.createdAt < dateFilter.$gte) continue;
          if (dateFilter.$lte && bid.createdAt > dateFilter.$lte) continue;
          logs.push({
            id: `auction:${a._id}:${bid._id || bid.tick}`,
            timestamp: bid.createdAt,
            category: 'auction',
            action: 'auction_bid',
            description: `Placed a bid of $${(bid.amount || 0).toLocaleString()} in auction`,
            amount: bid.amount || 0,
            entityType: 'auction',
            entityId: a._id,
            actor: 'user',
            source: 'auction',
          });
        }
        if (a.winnerId?.toString() === userId) {
          logs.push({
            id: `auction:${a._id}:won`,
            timestamp: a.createdAt,
            category: 'auction',
            action: 'auction_won',
            description: `Won auction with a bid of $${(a.winningBid || 0).toLocaleString()}`,
            amount: a.winningBid || 0,
            entityType: 'auction',
            entityId: a._id,
            actor: 'user',
            source: 'auction',
          });
        }
      }
    }

    // Registration (from the user document itself)
    if (!category || category === 'account') {
      const regDate = user.createdAt;
      if (!dateFilter.$gte || regDate >= dateFilter.$gte) {
        if (!dateFilter.$lte || regDate <= dateFilter.$lte) {
          logs.push({
            id: 'registration',
            timestamp: regDate,
            category: 'account',
            action: 'registered',
            description: 'Account registered',
            amount: null,
            entityType: 'user',
            entityId: user._id,
            actor: 'system',
            source: 'registration',
          });
        }
      }
    }

    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let filtered = logs;
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter(
        (l) =>
          (l.description || '').toLowerCase().includes(q) ||
          (l.action || '').toLowerCase().includes(q) ||
          (l.category || '').toLowerCase().includes(q),
      );
    }

    const total = filtered.length;
    const start = (pageNum - 1) * limitNum;
    const paginated = filtered.slice(start, start + limitNum);

    res.json({
      logs: paginated,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      limit: limitNum,
      categories: [
        'auth',
        'market',
        'rent',
        'loans',
        'development',
        'income',
        'stock',
        'missions',
        'achievements',
        'career',
        'company',
        'season',
        'auction',
        'admin',
        'account',
      ],
    });
  } catch (err) {
    console.error('[Admin Activity] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/users/:id/restore', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.deletedAt) return res.status(400).json({ error: 'Account is not deleted' });
    user.deletedAt = null;
    await user.save({ validateBeforeSave: false });
    await logAdminAction(req, 'user_restored', user);
    res.json({ success: true, message: 'Account restored' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/users/:id/permanent', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await User.deleteOne({ _id: user._id });
    await logAdminAction(req, 'user_permanently_deleted', user);
    res.json({ success: true, message: 'Account permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/balance', async (req, res) => {
  try {
    const { balance } = req.body;
    if (balance == null || balance < 0) {
      return res.status(400).json({ error: 'Invalid balance' });
    }
    const prev = await User.findById(req.params.id).select('balance username');
    const user = await User.findByIdAndUpdate(req.params.id, { balance }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    await logAdminAction(req, 'user_balance_changed', user, {
      previous: prev?.balance ?? null,
      new: balance,
      amount: balance - (prev?.balance ?? 0),
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/ban', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.banned = !user.banned;
    await user.save();
    await logAdminAction(req, user.banned ? 'user_banned' : 'user_unbanned', user);
    res.json({ _id: user._id, username: user.username, banned: user.banned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }
    const previousRole = user.role;
    user.role = role;
    await user.save();
    await logAdminAction(req, 'user_role_changed', user, { previous: previousRole, new: role });
    res.json({ _id: user._id, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/level', async (req, res) => {
  try {
    const { level } = req.body;
    if (level == null || level < 1 || !Number.isInteger(level)) {
      return res.status(400).json({ error: 'Invalid level' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const previousLevel = user.level;
    user.level = level;
    user.xp = 0;
    user.xpToNextLevel = getXpForLevel(level);
    await user.save();
    await logAdminAction(req, 'user_level_changed', user, { previous: previousLevel, new: level });
    res.json({
      _id: user._id,
      username: user.username,
      level: user.level,
      xp: user.xp,
      xpToNextLevel: user.xpToNextLevel,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/created-at', async (req, res) => {
  try {
    const { createdAt } = req.body;
    if (!createdAt) {
      return res.status(400).json({ error: 'createdAt is required' });
    }
    const date = new Date(createdAt);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    const result = await User.collection.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { createdAt: date } },
      { returnDocument: 'after' },
    );
    if (!result) return res.status(404).json({ error: 'User not found' });
    await logAdminAction(
      req,
      'user_created_at_changed',
      {
        _id: result._id,
        username: result.username,
      },
      { new: date.toISOString() },
    );
    res.json({ _id: result._id, username: result.username, createdAt: result.createdAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/properties', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
    const skip = (page - 1) * limit;
    const [properties, total] = await Promise.all([
      Property.find()
        .populate('ownerId', 'username')
        .populate('cityId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Property.countDocuments(),
    ]);
    res.json({ properties, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/properties', async (req, res) => {
  try {
    const { cityId, type, name, basePrice, ownerId } = req.body;
    if (!cityId || !type || !name || !basePrice) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const property = await Property.create({
      cityId,
      type,
      name,
      basePrice,
      currentPrice: basePrice,
      rent: clampMonthlyRent(basePrice * 0.004),
      ownerId: ownerId || null,
      forSale: true,
    });
    if (ownerId) {
      await User.findByIdAndUpdate(ownerId, { $push: { ownedProperties: property._id } });
    }
    res.status(201).json(property);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/properties/:id', async (req, res) => {
  try {
    const property = await Property.findByIdAndDelete(req.params.id);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (property.ownerId) {
      await User.findByIdAndUpdate(property.ownerId, { $pull: { ownedProperties: property._id } });
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/properties/:id', async (req, res) => {
  try {
    const updates = {};
    const allowed = ['currentPrice', 'basePrice', 'rent', 'condition', 'forSale', 'ownerId', 'volatility'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const property = await Property.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!property) return res.status(404).json({ error: 'Property not found' });
    res.json(property);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/cities/:id', async (req, res) => {
  try {
    const updates = {};
    const allowed = [
      'demandIndex',
      'supplyIndex',
      'population',
      'growthRate',
      'avgPrice',
      'avgRent',
      'economicCondition',
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const city = await City.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!city) return res.status(404).json({ error: 'City not found' });
    res.json(city);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/events', async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/events', async (req, res) => {
  try {
    const { name, description, type, impact, affectedCities, duration } = req.body;
    const event = await Event.create({
      name,
      description,
      type,
      impact: impact || {},
      affectedCities: affectedCities || [],
      duration: duration || 3,
      remainingTicks: duration || 3,
      active: true,
    });
    for (const cityId of affectedCities || []) {
      await City.findByIdAndUpdate(cityId, {
        $push: { activeEvents: { eventId: event._id, remainingTicks: duration || 3 } },
      });
    }
    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/events/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (req.body.active !== undefined) {
      const wasActive = event.active;
      event.active = req.body.active;
      if (!event.active && wasActive) {
        const cities = await City.find({ 'activeEvents.eventId': event._id });
        for (const city of cities) {
          city.activeEvents = city.activeEvents.filter((e) => e.eventId.toString() !== event._id.toString());
          await city.save();
        }
      } else if (event.active && !wasActive) {
        const cities = await City.find({ _id: { $in: event.affectedCities } });
        for (const city of cities) {
          if (!city.activeEvents.some((e) => e.eventId.toString() === event._id.toString())) {
            city.activeEvents.push({ eventId: event._id, remainingTicks: event.remainingTicks });
            await city.save();
          }
        }
      }
    }
    await event.save();
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/construction-projects', async (req, res) => {
  try {
    const projects = await ConstructionProject.find()
      .populate('ownerId', 'username')
      .populate('landId', 'name location')
      .populate('cityId', 'name country')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/construction-projects/:id', async (req, res) => {
  try {
    const updates = {};
    const allowed = ['progress', 'status', 'totalCost', 'delayTicks'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const project = await ConstructionProject.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!project) return res.status(404).json({ error: 'Construction project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/construction-projects/trigger-event', async (req, res) => {
  try {
    const { cityId, eventType } = req.body;
    const filter = cityId ? { cityId, status: 'under_construction' } : { status: 'under_construction' };
    const projects = await ConstructionProject.find(filter);

    const eventTemplates = {
      material_shortage: { delayTicks: 5, label: 'Material Shortage' },
      budget_increase: { costIncreasePercent: 10, label: 'Budget Increase' },
      labor_strike: { delayTicks: 8, label: 'Labor Strike' },
      weather_delay: { delayTicks: 3, label: 'Weather Delay' },
      permit_issue: { delayTicks: 6, label: 'Permit Issue' },
    };

    const event = eventTemplates[eventType];
    if (!event) return res.status(400).json({ error: 'Invalid event type' });

    const updated = [];
    for (const project of projects) {
      if (event.delayTicks) {
        project.delayTicks = (project.delayTicks || 0) + event.delayTicks;
        project.constructionPeriods += event.delayTicks;
      }
      if (event.costIncreasePercent) {
        const increase = Math.round(project.totalCost * (event.costIncreasePercent / 100));
        project.totalCost += increase;
      }
      await project.save();
      updated.push({ projectId: project._id, projectName: project.projectName });
    }

    res.json({
      eventApplied: event.label,
      affectedProjects: updated.length,
      projects: updated,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/development-zones', async (req, res) => {
  try {
    const zones = Object.entries(DEVELOPMENT_PROJECTS).flatMap(([cat, catData]) =>
      catData.projects.map((p) => ({
        id: p.id,
        name: p.name,
        category: cat,
        baseCost: p.baseCost,
        constructionPeriods: p.constructionPeriods,
        unitsGenerated: p.unitsGenerated,
      })),
    );
    res.json(zones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/seasons', async (req, res) => {
  try {
    const seasons = await Season.find().sort({ number: -1 });
    res.json(seasons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/seasons/current', async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.json(null);
    res.json(season);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/seasons/preview', async (req, res) => {
  try {
    const [totalUsers, totalProperties, totalTransactions, totalLoans, totalConstruction] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments(),
      Transaction.countDocuments(),
      Loan.countDocuments({ active: true }),
      ConstructionProject.countDocuments({ status: 'under_construction' }),
    ]);

    res.json({
      willReset: {
        users: totalUsers,
        properties: totalProperties,
        transactions: totalTransactions,
        activeLoans: totalLoans,
        activeConstruction: totalConstruction,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/seasons/create', async (req, res) => {
  try {
    const activeSeason = await getCurrentSeason();
    if (activeSeason) {
      return res.status(400).json({ error: 'An active season already exists' });
    }
    const season = await createNewSeason();
    res.json({ message: `Season ${season.number} created`, season });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/seasons/end', async (req, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== true) {
      return res.status(400).json({ error: 'Set confirm: true to end the current season' });
    }

    const activeSeason = await getCurrentSeason();
    if (!activeSeason) {
      return res.status(404).json({ error: 'No active season found' });
    }

    const newSeason = await endCurrentSeasonAndStartNew();
    await logAdminAction(req, 'season_ended', null, {
      endedSeason: activeSeason.number,
      newSeason: newSeason.number,
    });

    res.json({
      message: `Season ${activeSeason.number} ended. Season ${newSeason.number} started.`,
      endedSeason: activeSeason.number,
      newSeason: newSeason.number,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/maintenance', async (req, res) => {
  try {
    const info = await getMaintenanceInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/maintenance/enable', async (req, res) => {
  try {
    const { message } = req.body;
    await setMaintenanceMode(true, message, req.user._id);
    console.log(`[ADMIN] Maintenance Mode Enabled by ${req.user.username}`);
    await logAdminAction(req, 'maintenance_enabled', null, { message: message || '' });
    await enqueueNotification({
      userId: null,
      type: 'system',
      title: 'Maintenance Mode Enabled',
      message: message || 'Maintenance mode has been enabled by an administrator.',
      eventKey: 'system:maintenance:enabled',
      entityType: 'system',
      global: true,
    });
    sendDiscordNotification({
      type: 'systemAlerts',
      title: 'Maintenance Mode Enabled',
      description: message || 'Maintenance mode has been enabled by an administrator.',
    }).catch(() => {});
    res.json({ enabled: true, message: message || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/maintenance/disable', async (req, res) => {
  try {
    await setMaintenanceMode(false, '', req.user._id);
    console.log(`[ADMIN] Maintenance Mode Disabled by ${req.user.username}`);
    await logAdminAction(req, 'maintenance_disabled', null);
    await enqueueNotification({
      userId: null,
      type: 'system',
      title: 'Maintenance Completed',
      message: 'Maintenance completed. Gameplay is available again.',
      eventKey: 'system:maintenance:disabled',
      entityType: 'system',
      global: true,
    });
    sendDiscordNotification({
      type: 'systemAlerts',
      title: 'Maintenance Completed',
      description: 'Maintenance completed. Gameplay is available again.',
    }).catch(() => {});
    res.json({ enabled: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/email/test', async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Email address is required' });

    await verifyConnection();

    const template = emailTemplates.testEmail({ timestamp: new Date().toISOString() });
    const result = await sendEmail({ to, ...template });

    if (result.sent) {
      res.json({ success: true, messageId: result.messageId });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/email/status', async (req, res) => {
  try {
    const { config } = await import('../config/index.js');
    const configured = !!(config.smtp.user && config.smtp.pass);
    let connected = false;

    if (configured) {
      try {
        await verifyConnection();
        connected = true;
      } catch {
        connected = false;
      }
    }

    res.json({
      configured,
      connected,
      host: config.smtp.host,
      port: config.smtp.port,
      from: config.emailFrom,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/real-estate-companies', async (req, res) => {
  try {
    const companies = await RealEstateCompany.find({ active: true })
      .populate('founderId', 'username')
      .populate('members.userId', 'username')
      .sort({ createdAt: -1 })
      .lean();

    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/real-estate-companies/:id', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id)
      .populate('founderId', 'username')
      .populate('members.userId', 'username avatar')
      .populate('applications.userId', 'username')
      .populate('loanRequests.requestedBy', 'username')
      .lean();

    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/real-estate-companies/:id', async (req, res) => {
  try {
    const { name, description, reputation, level, treasuryBalance, maxMembers } = req.body;
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    if (name !== undefined) company.name = name;
    if (description !== undefined) company.description = description;
    if (reputation !== undefined) company.reputation = reputation;
    if (level !== undefined) {
      company.level = level;
      company.xp = xpRequiredForLevel(level);
      company.xpToNextLevel = xpRequiredForNextLevel(level);
    }
    if (treasuryBalance !== undefined) company.treasury.balance = treasuryBalance;
    if (maxMembers !== undefined) company.maxMembers = maxMembers;

    await company.save();
    res.json({ success: true, company });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/real-estate-companies/:id', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    company.active = false;
    await company.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/real-estate-companies/:id/members/:userId/role', async (req, res) => {
  try {
    const { role } = req.body;
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const member = company.members.find((m) => m.userId?.toString() === req.params.userId);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    member.role = role;
    await company.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/real-estate-companies/:id/members/:userId', async (req, res) => {
  try {
    const company = await RealEstateCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    company.members = company.members.filter((m) => m.userId?.toString() !== req.params.userId);
    await company.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
