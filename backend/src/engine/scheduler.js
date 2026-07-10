import cron from 'node-cron';
import crypto from 'crypto';
import { executeTick } from './tick.js';
import { acquireTickLock, releaseTickLock } from '../models/GameState.js';
import { config } from '../config/index.js';

const ownerId = crypto.randomUUID();

export function startScheduler() {
  const expression = `*/${config.tickIntervalMinutes} * * * *`;

  console.log(`[SCHEDULER] World tick scheduled every ${config.tickIntervalMinutes} minutes (${expression})`);
  console.log(`[SCHEDULER] Instance ID: ${ownerId}`);

  cron.schedule(expression, async () => {
    const lockAcquired = await acquireTickLock(ownerId);
    if (!lockAcquired) {
      console.log('[SCHEDULER] Tick lock held by another instance, skipping...');
      return;
    }

    try {
      await executeTick();
    } catch (err) {
      console.error('[SCHEDULER] Tick failed:', err);
    } finally {
      await releaseTickLock(ownerId);
    }
  });

  console.log('[SCHEDULER] Scheduler started');
}
