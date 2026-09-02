import { Router } from 'express';
import { config } from '../config/index.js';
import { requireAdmin } from '../middleware/admin.js';
import RewardedAdSession from '../models/RewardedAdSession.js';
import RewardedAdConfig, { DEFAULT_ESTIMATED_CPM } from '../models/RewardedAdConfig.js';
import Transaction from '../models/Transaction.js';
import AdminAuditLog from '../models/AdminAuditLog.js';

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

function round1(n) {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

// Projected revenue from the admin-tunable estimated CPM. Exposed separately
// from the real rewarded spend so operators can compare the two.
function estimateRevenue(impressions, estimatedCpm) {
  return round1((impressions / 1000) * estimatedCpm);
}

function rangeStart(range) {
  const now = new Date();
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  switch (range) {
    case 'today':
      return new Date(startOfToday);
    case '7d':
      return new Date(startOfToday - 7 * 86400000);
    case '30d':
      return new Date(startOfToday - 30 * 86400000);
    default:
      return null; // all
  }
}

// Session-count breakdown by status within a date window (optionally scoped to
// a single user). Returns the live counts plus the sum of per-session counters.
async function sessionBreakdown(createdFrom) {
  const match = createdFrom ? { createdAt: { $gte: createdFrom } } : {};

  const [byStatus, totals, rewarded] = await Promise.all([
    RewardedAdSession.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    RewardedAdSession.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          impressions: { $sum: '$impressions' },
          attempts: { $sum: '$completionAttemptCount' },
          failed: { $sum: '$failedCompletionCount' },
        },
      },
    ]),
    RewardedAdSession.countDocuments({
      status: 'completed',
      ...(createdFrom ? { createdAt: { $gte: createdFrom } } : {}),
    }),
  ]);

  const t = totals[0] || { impressions: 0, attempts: 0, failed: 0 };
  const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  return {
    impressions: t.impressions || 0,
    completionAttempts: t.attempts || 0,
    failedCompletions: t.failed || 0,
    rewarded: rewarded,
    counts,
  };
}

export async function getRewardedAdConfigCpm() {
  const doc = await RewardedAdConfig.findOne({ key: 'default' });
  return doc ? { estimatedCpm: doc.estimatedCpm } : { estimatedCpm: DEFAULT_ESTIMATED_CPM };
}

// One summary block for a date range. Impressions are ≥ the number of completed
// sessions, so the completed-rate funnel is worst-case — a safe upper bound.
async function summaryForRange(range) {
  const from = rangeStart(range);
  const breakdown = await sessionBreakdown(from);
  const completed = breakdown.counts.completed || 0;
  const completionRate =
    breakdown.completionAttempts > 0 ? Math.round((completed / breakdown.completionAttempts) * 1000) / 10 : null;
  const cpm = (await getRewardedAdConfigCpm()).estimatedCpm;
  return {
    range,
    totalSessions:
      (breakdown.counts.pending || 0) +
      (breakdown.counts.completed || 0) +
      (breakdown.counts.expired || 0) +
      (breakdown.counts.aborted || 0),
    pending: breakdown.counts.pending || 0,
    expired: breakdown.counts.expired || 0,
    aborted: breakdown.counts.aborted || 0,
    impressions: breakdown.impressions,
    completionAttempts: breakdown.completionAttempts,
    failedCompletions: breakdown.failedCompletions,
    completed,
    rewarded: breakdown.rewarded,
    completionRate,
    estimatedRevenue: estimateRevenue(breakdown.impressions, cpm),
  };
}

// Aggregate revenue actually handed out (the cash cost of the program), split
// by the same date windows the summary uses.
async function spendByRange() {
  const now = new Date();
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const windows = {
    today: new Date(startOfToday),
    '7d': new Date(startOfToday - 7 * 86400000),
    '30d': new Date(startOfToday - 30 * 86400000),
  };

  const results = { today: 0, '7d': 0, '30d': 0, all: 0 };
  const [today, seven, thirty, ever] = await Promise.all([
    Transaction.aggregate([
      { $match: { type: 'rewarded_ad', createdAt: { $gte: windows.today } } },
      { $group: { _id: null, total: { $sum: '$price' } } },
    ]),
    Transaction.aggregate([
      { $match: { type: 'rewarded_ad', createdAt: { $gte: windows['7d'] } } },
      { $group: { _id: null, total: { $sum: '$price' } } },
    ]),
    Transaction.aggregate([
      { $match: { type: 'rewarded_ad', createdAt: { $gte: windows['30d'] } } },
      { $group: { _id: null, total: { $sum: '$price' } } },
    ]),
    Transaction.aggregate([{ $match: { type: 'rewarded_ad' } }, { $group: { _id: null, total: { $sum: '$price' } } }]),
  ]);
  results.today = today[0]?.total || 0;
  results['7d'] = seven[0]?.total || 0;
  results['30d'] = thirty[0]?.total || 0;
  results.all = ever[0]?.total || 0;
  return results;
}

function buildLimitConfig() {
  return {
    rewardAmount: config.rewardedAds.rewardAmount,
    cooldownMinutes: config.rewardedAds.cooldownMinutes,
    dailyLimit: config.rewardedAds.dailyLimit,
    sessionTtlMinutes: config.rewardedAds.sessionTtlMinutes,
  };
}

function buildProviderMeta() {
  return {
    provider: config.rewardedAds.provider,
    publisherDashboardUrl: config.rewardedAds.publisherDashboardUrl,
    publisherHelpUrl: config.rewardedAds.publisherHelpUrl,
  };
}

// Dashboard summary across the four ranges plus real spend and limits.
router.get('/dashboard', async (req, res) => {
  try {
    const ranges = ['today', '7d', '30d', 'all'];
    const summaries = await Promise.all(ranges.map(summaryForRange));
    const [spend, cpm] = await Promise.all([spendByRange(), Promise.resolve(getRewardedAdConfigCpm())]);

    const byRange = {
      today: summaries[0],
      '7d': summaries[1],
      '30d': summaries[2],
      all: summaries[3],
    };

    res.json({
      ranges: byRange,
      spend: {
        today: spend.today,
        '7d': spend['7d'],
        '30d': spend['30d'],
        all: spend.all,
      },
      estimatedCpm: cpm.estimatedCpm,
      limits: buildLimitConfig(),
      provider: buildProviderMeta(),
      enabled: config.rewardedAds.enabled,
    });
  } catch (err) {
    res.serverError(err);
  }
});

// Daily session / impression counts for a lightweight chart (client-side). No
// completion/attempt granularity — the dashboard uses the range blocks for that.
router.get('/daily', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 30, 90);
    if (![7, 30, 90].includes(days)) {
      return res.status(400).json({ error: 'days must be one of 7, 30, 90' });
    }
    const from = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - (days - 1) * 86400000,
    );

    const rows = await RewardedAdSession.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: {
            y: { $year: '$createdAt' },
            m: { $month: '$createdAt' },
            d: { $dayOfMonth: '$createdAt' },
          },
          sessions: { $sum: 1 },
          impressions: { $sum: '$impressions' },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } },
    ]);

    const dayMap = new Map(rows.map((r) => [`${r._id.y}-${r._id.m}-${r._id.d}`, r]));

    // Fill gaps so the chart renders a continuous axis.
    const points = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(new Date(from).getTime() + i * 86400000);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
      const hit = dayMap.get(key);
      points.push({
        date: key,
        sessions: hit?.sessions || 0,
        impressions: hit?.impressions || 0,
        completed: hit?.completed || 0,
      });
    }

    res.json({ days, points });
  } catch (err) {
    res.serverError(err);
  }
});

// Paginated recent-sessions table for the admin dashboard (admin-only, so the
// raw VAST url and amount are fine to expose here — never via public routes).
router.get('/sessions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const statusFilter = req.query.status;

    const filter = statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {};

    const [rows, total] = await Promise.all([
      RewardedAdSession.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'username'),
      RewardedAdSession.countDocuments(filter),
    ]);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      sessions: rows.map((s) => ({
        id: s._id,
        user: s.userId?.username || null,
        date: s.createdAt,
        status: s.status,
        rewardAmount: s.rewardAmount,
        impressions: s.impressions,
        completionAttempts: s.completionAttemptCount,
        failedCompletions: s.failedCompletionCount,
        completedAt: s.completedAt,
        expiresAt: s.expiresAt,
      })),
    });
  } catch (err) {
    res.serverError(err);
  }
});

// Admin-tunable settings. Only the estimated CPM (revenue projection) is
// writable via the UI; the VAST url and market config stay env-driven.
router.get('/config', async (req, res) => {
  try {
    const cpm = await getRewardedAdConfigCpm();
    res.json({
      estimatedCpm: cpm.estimatedCpm,
      limits: buildLimitConfig(),
      provider: buildProviderMeta(),
      enabled: config.rewardedAds.enabled,
    });
  } catch (err) {
    res.serverError(err);
  }
});

router.put('/config', async (req, res) => {
  try {
    const cpm = Number(req.body.estimatedCpm);
    if (!Number.isFinite(cpm) || cpm < 0) {
      return res.status(400).json({ error: 'estimatedCpm must be a non-negative number' });
    }
    const doc = await RewardedAdConfig.findOneAndUpdate(
      { key: 'default' },
      { $set: { estimatedCpm: cpm }, $setOnInsert: { key: 'default' } },
      { new: true, upsert: true },
    );
    await logAdminAction(req, 'rewarded_ads_config_updated', null, { estimatedCpm: doc.estimatedCpm });
    res.json({ estimatedCpm: doc.estimatedCpm });
  } catch (err) {
    res.serverError(err);
  }
});

export default router;
