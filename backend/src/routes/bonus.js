import { Router } from 'express';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { awardXp } from '../utils/leveling.js';

const router = Router();

const PERIOD_MS = 6 * 60 * 60 * 1000;

function getCurrentPeriod() {
  return Math.floor(Date.now() / PERIOD_MS);
}

function getNextPeriodStart() {
  const now = Date.now();
  const currentPeriod = Math.floor(now / PERIOD_MS);
  return (currentPeriod + 1) * PERIOD_MS;
}

const MIN_MONEY = 250;
const MAX_MONEY = 1000;
const MIN_XP = 10;
const MAX_XP = 50;

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

router.get('/status', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('lastPeriodBonusClaim level');
    const currentPeriod = getCurrentPeriod();
    const lastClaim = user.lastPeriodBonusClaim;
    const lastClaimPeriod = lastClaim ? Math.floor(lastClaim.getTime() / PERIOD_MS) : -1;
    const available = currentPeriod > lastClaimPeriod;
    const nextPeriodStart = getNextPeriodStart();
    const nextInMs = nextPeriodStart - Date.now();

    res.json({
      available,
      nextPeriodAt: new Date(nextPeriodStart).toISOString(),
      nextInMs,
      lastClaimedAt: lastClaim || null,
      level: user.level,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/claim', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const currentPeriod = getCurrentPeriod();
    const lastClaim = user.lastPeriodBonusClaim;
    const lastClaimPeriod = lastClaim ? Math.floor(lastClaim.getTime() / PERIOD_MS) : -1;

    if (currentPeriod <= lastClaimPeriod) {
      return res.status(400).json({ error: 'Bonus already claimed this period' });
    }

    const money = randomBetween(MIN_MONEY, MAX_MONEY);
    const xp = randomBetween(MIN_XP, MAX_XP);

    user.balance += money;
    user.lastPeriodBonusClaim = new Date();
    await user.save();

    const xpResult = await awardXp(user, xp, 'period_bonus');

    res.json({
      money,
      xp,
      balance: user.balance,
      level: xpResult.level,
      xpInLevel: xpResult.xp,
      xpToNextLevel: xpResult.xpToNextLevel,
      levelUps: xpResult.levelUps,
      nextPeriodAt: new Date(getNextPeriodStart()).toISOString(),
      nextInMs: getNextPeriodStart() - Date.now(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
