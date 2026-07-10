import { Router } from 'express';
import { getGameState } from '../models/GameState.js';
import { config } from '../config/index.js';

const router = Router();

router.get('/status', async (req, res) => {
  try {
    const state = await getGameState();
    const now = new Date();
    const tickMs = config.tickIntervalMinutes * 60 * 1000;
    const lastTick = state.lastTickAt ? new Date(state.lastTickAt) : null;
    const nextUpdateAt = lastTick ? new Date(lastTick.getTime() + tickMs) : new Date(now.getTime() + tickMs);

    res.json({
      currentCycle: state.tickNumber,
      lastUpdateAt: state.lastTickAt || null,
      nextUpdateAt: nextUpdateAt.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
