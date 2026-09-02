import { Router } from 'express';
import mongoose from 'mongoose';
import { config } from '../config/index.js';
import { authenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import RewardedAdSession from '../models/RewardedAdSession.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { creditUserBalance } from '../utils/atomicBalance.js';
import { withUserLock } from '../utils/userMutex.js';
import { acquireLock, releaseLock } from '../utils/redisLock.js';
import { createNotification } from '../utils/notificationQueue.js';
import { processPlayerProgress } from '../utils/playerProgress.js';
import { trackEvent, EVENTS } from '../utils/analytics.js';

const router = Router();

const VAST_FETCH_TIMEOUT_MS = 10_000;

const startLimiter = rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'rewarded-ad-start' });
const completeLimiter = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'rewarded-ad-complete' });

function adsEnabled() {
  return config.rewardedAds.enabled && config.rewardedAds.ready;
}

function publicConfig() {
  return {
    enabled: adsEnabled(),
    rewardAmount: config.rewardedAds.rewardAmount,
    cooldownSeconds: config.rewardedAds.cooldownMinutes * 60,
    dailyLimit: config.rewardedAds.dailyLimit,
  };
}

async function markExpired(session) {
  if (session.status === 'pending') {
    session.status = 'expired';
    await session.save().catch(() => {});
  }
}

// Records a rejected completion attempt against a still-pending session for the
// admin analytics funnel (Start -> Complete attempt -> Rewarded). Best-effort —
// never blocks the request.
function countFailedCompletion(sessionId) {
  return RewardedAdSession.updateOne({ _id: sessionId }, { $inc: { failedCompletionCount: 1 } }).catch(() => {});
}

function countCompletedToday(userId, date = new Date()) {
  const startOfDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return RewardedAdSession.countDocuments({
    userId,
    status: 'completed',
    completedAt: { $gte: new Date(startOfDay) },
  });
}

// Public, secret-free flags for the frontend (no VAST url, no market-config).
router.get('/config', (req, res) => {
  res.json(publicConfig());
});

// Per-user status: cooldown / daily progress against the CURRENT server config.
router.get('/status', authenticate, async (req, res) => {
  try {
    if (!adsEnabled()) return res.json({ enabled: false });

    const userId = req.user._id;
    const cooldownMs = config.rewardedAds.cooldownMinutes * 60 * 1000;
    const cutoff = new Date(Date.now() - cooldownMs);

    const [lastCompleted, dailyUsed] = await Promise.all([
      RewardedAdSession.findOne({ userId, status: 'completed', completedAt: { $gt: cutoff } })
        .sort({ completedAt: -1 })
        .select('completedAt'),
      countCompletedToday(userId),
    ]);

    const cooldownRemainingMs = lastCompleted
      ? Math.max(0, lastCompleted.completedAt.getTime() + cooldownMs - Date.now())
      : 0;

    res.json({ ...publicConfig(), dailyUsed, cooldownRemainingMs });
  } catch (err) {
    res.serverError(err);
  }
});

// Opens a short-lived, single-use session. The server decides the ad source
// and reward amount — the client only gets the session/reward snapshot.
router.post('/start', authenticate, startLimiter, async (req, res) => {
  try {
    if (!adsEnabled()) {
      return res.status(503).json({ error: 'Rewarded ads are not available right now' });
    }

    const userId = req.user._id;
    const ttlMs = config.rewardedAds.sessionTtlMinutes * 60 * 1000;

    const userIdStr = userId?.toString?.() || userId;
    const active = await RewardedAdSession.findOne({
      userId: userIdStr,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (active) {
      return res.json({
        sessionId: active._id,
        status: active.status,
        rewardAmount: active.rewardAmount,
        expiresAt: active.expiresAt,
      });
    }

    const session = await RewardedAdSession.create({
      userId,
      status: 'pending',
      vastUrl: config.rewardedAds.vastUrl,
      rewardAmount: config.rewardedAds.rewardAmount,
      expiresAt: new Date(Date.now() + ttlMs),
    });

    res.json({
      sessionId: session._id,
      status: session.status,
      rewardAmount: session.rewardAmount,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    res.serverError(err);
  }
});

// Serves the session's VAST document through the backend (server-controlled ad
// source; the client never embeds the upstream URL). Ownership-checked.
router.get('/session/:id/vast', authenticate, async (req, res) => {
  let session;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    session = await RewardedAdSession.findOne({ _id: req.params.id, userId: req.user._id });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status !== 'pending') {
      return res.status(409).json({ error: 'Session is no longer pending' });
    }
    if (session.expiresAt <= new Date()) {
      await markExpired(session);
      return res.status(410).json({ error: 'Session expired' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VAST_FETCH_TIMEOUT_MS);
    try {
      const upstream = await fetch(session.vastUrl, {
        headers: {
          Accept: 'application/xml, text/xml;q=0.9, */*;q=0.1',
          'User-Agent': 'CityFlow/1.0 (ad session ' + session._id + ')',
        },
        signal: controller.signal,
      });
      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      if (!upstream.ok) {
        await markExpired(session);
        return res.status(502).json({ error: 'Ad source is temporarily unavailable' });
      }
      if (!contentType.includes('xml') && !contentType.includes('text/')) {
        await markExpired(session);
        return res.status(502).json({ error: 'Ad source returned an unexpected response' });
      }
      const xml = await upstream.text();
      // A successful serve of the VAST doc (impression). Increment on the
      // session record so the admin dashboard can project CPM-based revenue.
      await RewardedAdSession.updateOne({ _id: session._id }, { $inc: { impressions: 1 } }).catch(() => {});
      res.set('Content-Type', 'text/xml; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      res.send(xml);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    if (session) await markExpired(session);
    res.serverError(err);
  }
});

// Completion — client-reported (the VAST protocol has no server-verifiable
// completion callback; see AGENTS.md). Any request body is IGNORED: reward
// amount comes only from the server-created session.
router.post('/:id/complete', authenticate, completeLimiter, async (req, res) => {
  try {
    if (!adsEnabled()) return res.status(503).json({ error: 'Rewarded ads are not available right now' });

    const sessionId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const userIdStr = req.user._id?.toString?.() || req.user._id;

    // A completion attempt happened. Counting it is best-effort and never
    // blocks the request.
    await RewardedAdSession.updateOne({ _id: req.params.id }, { $inc: { completionAttemptCount: 1 } }).catch(() => {});

    await withUserLock(`rewardedAd:${userIdStr}`, async () => {
      const lockName = `rewarded-ad:${userIdStr}`;
      const lockToken = await acquireLock(lockName, 15_000);
      try {
        const session = await RewardedAdSession.findOne({ _id: sessionId, userId: req.user._id });
        if (!session) {
          const err = new Error('Session not found');
          err.status = 404;
          throw err;
        }
        if (session.status === 'completed') {
          const err = new Error('This ad was already claimed');
          err.status = 409;
          err.alreadyCompleted = true;
          throw err;
        }
        if (session.status === 'aborted') {
          const err = new Error('This ad session was aborted');
          err.status = 400;
          throw err;
        }
        if (session.expiresAt <= new Date()) {
          await markExpired(session);
          const err = new Error('This ad session expired');
          err.status = 410;
          throw err;
        }

        const cooldownMs = config.rewardedAds.cooldownMinutes * 60 * 1000;
        const cutoff = new Date(Date.now() - cooldownMs);
        const lastCompleted = await RewardedAdSession.findOne({
          userId: req.user._id,
          status: 'completed',
          completedAt: { $gt: cutoff },
        }).sort({ completedAt: -1 });

        if (lastCompleted) {
          const cooldownRemainingMs = Math.max(0, lastCompleted.completedAt.getTime() + cooldownMs - Date.now());
          const err = new Error('You are on cooldown between ad rewards');
          err.status = 429;
          err.cooldownRemainingMs = cooldownRemainingMs;
          err.retryAfter = cooldownRemainingMs;
          await countFailedCompletion(session._id);
          throw err;
        }

        const dailyUsed = await countCompletedToday(req.user._id);
        if (dailyUsed >= config.rewardedAds.dailyLimit) {
          const err = new Error('Daily ad reward limit reached');
          err.status = 429;
          err.dailyLimit = config.rewardedAds.dailyLimit;
          err.retryAfter = '86400';
          await countFailedCompletion(session._id);
          throw err;
        }

        // Atomic single-use transition: concurrent completes for the same
        // session can never both win — only one request observes status
        // 'pending' and flips it.
        const claimed = await RewardedAdSession.findOneAndUpdate(
          { _id: sessionId, userId: req.user._id, status: 'pending', expiresAt: { $gt: new Date() } },
          { $set: { status: 'completed', completedAt: new Date(), abortedAt: null } },
          { new: true },
        );

        if (!claimed) {
          const err = new Error('This ad session can no longer be claimed');
          err.status = 409;
          await countFailedCompletion(sessionId);
          throw err;
        }

        const amount = claimed.rewardAmount;

        try {
          await creditUserBalance(req.user._id, amount);
        } catch (creditErr) {
          // Payout write failed: never double-pay, and never lose the reward.
          // Revert to pending so the player can retry completion.
          await RewardedAdSession.updateOne(
            { _id: claimed._id },
            { $set: { status: 'pending', completedAt: null, abortedAt: null } },
          ).catch(() => {});
          throw creditErr;
        }

        await Transaction.create({
          buyerId: req.user._id,
          type: 'rewarded_ad',
          price: amount,
        });

        await createNotification({
          userId: req.user._id,
          type: 'rewarded_ad',
          title: 'Rewarded Ad',
          message: `You earned ${amount} by watching a rewarded ad`,
          eventKey: `rewardedad:${claimed._id}:completed`,
        }).catch(() => {});

        await processPlayerProgress(req.user._id, 'rewarded_ad_watch', { skipXp: false });

        trackEvent(EVENTS.REWARDED_AD_COMPLETED, {
          userId: req.user._id,
          amount,
        }).catch(() => {});

        const user = await User.findById(req.user._id).select('balance');
        res.json({
          success: true,
          rewardAmount: amount,
          balance: user?.balance ?? 0,
        });
      } finally {
        if (lockToken) await releaseLock(lockName, lockToken);
      }
    });
  } catch (err) {
    if (err.status === 429 || err.status === 409 || err.status === 404 || err.status === 410 || err.status === 400) {
      const body = { error: err.message };
      if (err.alreadyCompleted) body.alreadyCompleted = true;
      if (err.cooldownRemainingMs !== undefined) body.cooldownRemainingMs = err.cooldownRemainingMs;
      if (err.dailyLimit !== undefined) body.dailyLimit = err.dailyLimit;
      if (err.retryAfter !== undefined) body.retryAfter = err.retryAfter;
      return res.status(err.status).json(body);
    }
    res.serverError(err);
  }
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const sessions = await RewardedAdSession.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('status rewardAmount expiresAt completedAt createdAt');
    res.json({ sessions });
  } catch (err) {
    res.serverError(err);
  }
});

export default router;
