import { Router } from 'express';
import Event from '../models/Event.js';
import { cacheGetOrSet } from '../utils/cache.js';
import { cacheKeys, cacheTTL } from '../utils/cacheKeys.js';

const router = Router();

router.get('/active', async (req, res) => {
  try {
    const events = await cacheGetOrSet(
      cacheKeys.activeEvents(),
      async () => Event.find({ active: true }).populate('affectedCities', 'name country coordinates population'),
      cacheTTL.short,
    );

    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
