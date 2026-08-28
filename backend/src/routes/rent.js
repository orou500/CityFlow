import { Router } from 'express';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { authenticate } from '../middleware/auth.js';
import { collectOperatingFee } from '../utils/companyFees.js';
import { onRentCollected } from '../utils/cacheInvalidation.js';
import { processPlayerProgress } from '../utils/playerProgress.js';
import { clearRentReadyNotification } from '../engine/rentProcessing.js';
import { withUserLock } from '../utils/userMutex.js';

const router = Router();

const RENT_STORAGE_DURATION_MS = 24 * 60 * 60 * 1000;

router.get('/status', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('uncollectedRent rentStorageStartedAt balance');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const uncollectedRent = user.uncollectedRent || 0;
    const storageStartedAt = user.rentStorageStartedAt || null;
    let expiresAt = null;
    let timeRemainingMs = null;
    let expired = false;

    if (storageStartedAt && uncollectedRent > 0) {
      expiresAt = new Date(storageStartedAt.getTime() + RENT_STORAGE_DURATION_MS);
      timeRemainingMs = Math.max(0, expiresAt.getTime() - Date.now());
      expired = timeRemainingMs === 0;
    }

    res.json({
      uncollectedRent,
      storageStartedAt,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      timeRemainingMs,
      expired,
      balance: user.balance,
    });
  } catch (err) {
    res.serverError(err);
  }
});

router.post('/collect', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const uncollectedRent = user.uncollectedRent || 0;

    if (uncollectedRent <= 0) {
      return res.status(400).json({ error: 'No rent to collect' });
    }

    const storageStartedAt = user.rentStorageStartedAt;
    if (storageStartedAt) {
      const elapsed = Date.now() - storageStartedAt.getTime();
      if (elapsed >= RENT_STORAGE_DURATION_MS) {
        await User.updateOne(
          { _id: req.user._id, uncollectedRent: { $gt: 0 } },
          { $set: { uncollectedRent: 0, rentStorageStartedAt: null } },
        );
        return res.status(400).json({ error: 'Rent has expired and was forfeited' });
      }
    }

    let collected = 0;
    await withUserLock(`rent:${req.user._id}`, async () => {
      // Atomic claim: only one request can convert uncollectedRent â†’ balance.
      const claimed = await User.findOneAndUpdate(
        { _id: req.user._id, uncollectedRent: { $gt: 0 } },
        [
          {
            $set: {
              balance: { $add: ['$balance', { $ifNull: ['$uncollectedRent', 0] }] },
              uncollectedRent: 0,
              rentStorageStartedAt: null,
              lastRentCollectedAt: new Date(),
              'lifetimeStats.totalRentCollected': {
                $add: [{ $ifNull: ['$lifetimeStats.totalRentCollected', 0] }, { $ifNull: ['$uncollectedRent', 0] }],
              },
            },
          },
        ],
        { new: true },
      );
      if (!claimed) {
        const err = new Error('No rent to collect');
        err.status = 400;
        throw err;
      }
      collected = uncollectedRent;

      collectOperatingFee(req.user._id, collected, 'rent_income');

      await onRentCollected(req.user._id);
      await clearRentReadyNotification(req.user._id);

      await Transaction.create({
        buyerId: req.user._id,
        type: 'rent',
        price: collected,
      });

      await processPlayerProgress(req.user._id, 'rent_collect');
    });

    const fresh = await User.findById(req.user._id);
    res.json({
      collected,
      balance: fresh.balance,
      message: `Collected $${collected.toLocaleString()} in rent`,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.serverError(err);
  }
});

export default router;
