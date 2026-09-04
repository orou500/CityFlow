import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import User from '../models/User.js';
import {
  isSupporter,
  resolveCosmetics,
  resetCosmetics,
  buildIdentityPayload,
  supporterBadge,
} from '../services/supporterIdentity.js';
import { getOptionsPayload } from '../config/supporterCosmetics.js';
import { cacheDel, cacheDelPattern } from '../utils/cache.js';

const router = Router();

/**
 * Public (unauthenticated) options payload — what cosmetic options exist and
 * at what tier each unlocks. Used by the customization panel. Exposes only
 * whitelisted IDs/labels, never any user-selected values.
 */
router.get('/options', (req, res) => {
  res.json({ options: getOptionsPayload() });
});

/**
 * Current user's supporter identity + cosmetics + eligibility. Server derives
 * eligibility from confirmed donations; the client can never set it.
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({
      identity: buildIdentityPayload(req.user),
      editable: isSupporter(req.user),
    });
  } catch (err) {
    res.serverError(err);
  }
});

/**
 * Save the current user's cosmetic selections. Server-authoritative: fields
 * are validated against the whitelist config + the user's earned tier. A
 * non-supporter can never persist cosmetics (resolveCosmetics forces defaults
 * or rejects).
 *
 * After saving, the user's cached leaderboard profile/rankings are invalidated
 * so identity updates propagate to leaderboards without waiting for TTLs.
 */
router.put('/me', authenticate, async (req, res) => {
  try {
    if (!isSupporter(req.user)) {
      return res.status(403).json({ error: 'Supporter cosmetics require a confirmed donation' });
    }
    // throw on invalid input
    const next = resolveCosmetics(req.user, req.body?.cosmetics);
    req.user.cosmetics = next;
    await req.user.save();
    await Promise.allSettled([
      cacheDel(`lb:player:${req.user._id}`),
      cacheDelPattern('lb:rankings:*'),
      cacheDelPattern('lb:summary:*'),
    ]);
    res.json({ identity: buildIdentityPayload(req.user), editable: true });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    res.serverError(err);
  }
});

/**
 * Reset cosmetics to safe tier defaults.
 */
router.post('/me/reset', authenticate, async (req, res) => {
  try {
    if (!isSupporter(req.user)) {
      return res.status(403).json({ error: 'Supporter cosmetics require a confirmed donation' });
    }
    req.user.cosmetics = resetCosmetics(req.user);
    await req.user.save();
    await Promise.allSettled([
      cacheDel(`lb:player:${req.user._id}`),
      cacheDelPattern('lb:rankings:*'),
      cacheDelPattern('lb:summary:*'),
    ]);
    res.json({ identity: buildIdentityPayload(req.user), editable: true });
  } catch (err) {
    res.serverError(err);
  }
});

/**
 * One-time supporter onboarding state. Armed server-side as 'pending' when a
 * donation is CONFIRMED (never by client input); the client reads it and
 * flips it to 'completed'/'skipped' — exactly once.
 */
router.get('/onboarding', authenticate, async (req, res) => {
  try {
    const state = req.user.supporterOnboarding || { status: 'none' };
    res.json({
      status: state.status || 'none',
      supporter: isSupporter(req.user),
    });
  } catch (err) {
    res.serverError(err);
  }
});

async function markOnboarding(req, res, status) {
  const nextStatus = status === 'completed' ? 'completed' : 'skipped';
  const state = req.user.supporterOnboarding || { status: 'none' };
  const effective =
    state.status === 'pending' ? nextStatus : state.status && state.status !== 'none' ? state.status : 'none';
  if (state.status === 'pending') {
    req.user.supporterOnboarding = {
      status: nextStatus,
      startedAt: state.startedAt || new Date(),
      completedAt: nextStatus === 'completed' ? new Date() : state.completedAt,
      skippedAt: nextStatus === 'skipped' ? new Date() : state.skippedAt,
    };
    await req.user.save();
  }
  res.json({ status: effective });
}

router.post('/onboarding/complete', authenticate, async (req, res) => {
  try {
    await markOnboarding(req, res, 'completed');
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/onboarding/skip', authenticate, async (req, res) => {
  try {
    await markOnboarding(req, res, 'skipped');
  } catch (err) {
    res.serverError(err);
  }
});

/**
 * Admin visibility — inspect a user's supporter status, tier, donation total,
 * cosmetic configuration and support date by username or user id. Admin-only.
 */
router.get('/admin/:identifier', requireAdmin, async (req, res) => {
  try {
    const { identifier } = req.params;
    const isId = /^[0-9a-fA-F]{24}$/.test(identifier);
    const user = await User.findOne(isId ? { _id: identifier } : { normalizedUsername: identifier.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      username: user.username,
      displayName: user.displayName || user.username,
      supporter: {
        badge: supporterBadge(user),
        eligible: isSupporter(user),
        isAnonymous: !!user.supporter?.isAnonymous,
        donatedTitle: user.supporter?.title || '',
      },
      donationStats: {
        totalDonated: user.donationStats?.totalDonated || 0,
        donationCount: user.donationStats?.donationCount || 0,
        donorSince: user.donationStats?.donorSince || null,
      },
      cosmetics: user.cosmetics || null,
    });
  } catch (err) {
    res.serverError(err);
  }
});

export default router;
