import { Router } from 'express';
import { getGameState } from '../models/GameState.js';
import { config } from '../config/index.js';
import { cacheGetOrSet } from '../utils/cache.js';
import { cacheKeys, cacheTTL } from '../utils/cacheKeys.js';

const router = Router();

router.get('/status', async (req, res) => {
  try {
    const data = await cacheGetOrSet(
      cacheKeys.worldStatus(),
      async () => {
        const state = await getGameState();
        const now = new Date();
        const tickMs = config.tickIntervalMinutes * 60 * 1000;
        const lastTick = state.lastTickAt ? new Date(state.lastTickAt) : null;
        const nextUpdateAt = lastTick ? new Date(lastTick.getTime() + tickMs) : new Date(now.getTime() + tickMs);

        return {
          currentCycle: state.tickNumber,
          lastUpdateAt: state.lastTickAt || null,
          nextUpdateAt: nextUpdateAt.toISOString(),
        };
      },
      cacheTTL.short,
    );

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
