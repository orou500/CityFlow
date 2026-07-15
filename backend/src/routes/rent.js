import { Router } from 'express';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

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
    res.status(500).json({ error: err.message });
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
        user.uncollectedRent = 0;
        user.rentStorageStartedAt = null;
        await user.save();
        return res.status(400).json({ error: 'Rent has expired and was forfeited' });
      }
    }

    const collected = uncollectedRent;
    user.balance += collected;
    user.uncollectedRent = 0;
    user.rentStorageStartedAt = null;
    await user.save();

    res.json({
      collected,
      balance: user.balance,
      message: `Collected $${collected.toLocaleString()} in rent`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
