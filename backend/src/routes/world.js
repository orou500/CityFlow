import { Router } from 'express';
import { getGameState } from '../models/GameState.js';
import { config } from '../config/index.js';
import { cacheGetOrSet } from '../utils/cache.js';
import { cacheKeys, cacheTTL } from '../utils/cacheKeys.js';

const router = Router();

// A season/world cycle lasts this many ticks. tick.js fires the season reset
// when the global tick counter reaches this value, then resets the counter to 0.
const SEASON_TICKS = 720;

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

        // The world reset is tick-driven: it fires when tickNumber reaches
        // SEASON_TICKS. The reset instant is therefore the exact time the
        // (SEASON_TICKS - tickNumber)th next tick executes — derived from the
        // same GameState the engine uses, never from client clocks.
        const ticksRemaining = state.tickNumber >= SEASON_TICKS ? SEASON_TICKS : SEASON_TICKS - state.tickNumber;
        const nextResetAt = lastTick
          ? new Date(lastTick.getTime() + ticksRemaining * tickMs)
          : new Date(now.getTime() + ticksRemaining * tickMs);

        return {
          currentCycle: state.tickNumber,
          lastUpdateAt: state.lastTickAt || null,
          nextUpdateAt: nextUpdateAt.toISOString(),
          nextResetAt: nextResetAt.toISOString(),
          seasonTicks: SEASON_TICKS,
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
