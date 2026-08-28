import { Router } from 'express';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { authenticate } from '../middleware/auth.js';
import { awardXp } from '../utils/leveling.js';
import { processPlayerProgress } from '../utils/playerProgress.js';
import { creditUserBalance } from '../utils/atomicBalance.js';
import { withUserLock } from '../utils/userMutex.js';

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
    res.serverError(err);
  }
});

router.post('/claim', authenticate, async (req, res) => {
  try {
    await withUserLock(`bonus:${req.user._id}`, async () => {
      const periodStart = new Date(Math.floor(Date.now() / PERIOD_MS) * PERIOD_MS);

      // Atomic claim: only one request can pass the period gate.
      const claimed = await User.findOneAndUpdate(
        {
          _id: req.user._id,
          $or: [{ lastPeriodBonusClaim: null }, { lastPeriodBonusClaim: { $lt: periodStart } }],
        },
        { $set: { lastPeriodBonusClaim: new Date() } },
        { new: true },
      );
      if (!claimed) {
        const err = new Error('Bonus already claimed this period');
        err.status = 400;
        throw err;
      }

      const money = randomBetween(MIN_MONEY, MAX_MONEY);
      const xp = randomBetween(MIN_XP, MAX_XP);

      // awardXp saves the (fresh) user doc â€” run it BEFORE the balance $inc so
      // its save() can never clobber the credit.
      const xpResult = await awardXp(claimed, xp, 'period_bonus');
      await creditUserBalance(req.user._id, money);

      await Transaction.create({
        buyerId: req.user._id,
        type: 'period_bonus',
        price: money,
        description: 'Period bonus claim',
      });

      await processPlayerProgress(req.user._id, 'bonus_claim', { skipXp: true });

      res.json({
        success: true,
        money,
        xp,
        balance: claimed.balance + money,
        level: xpResult.level,
        xpInLevel: xpResult.xp,
        xpToNextLevel: xpResult.xpToNextLevel,
        levelUps: xpResult.levelUps,
        nextPeriodAt: new Date(getNextPeriodStart()).toISOString(),
        nextInMs: getNextPeriodStart() - Date.now(),
      });
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.serverError(err);
  }
});

export default router;
