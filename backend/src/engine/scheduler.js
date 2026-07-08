import cron from 'node-cron';
import { executeTick } from './tick.js';
import { config } from '../config/index.js';

let isRunning = false;

export function startScheduler() {
  const expression = `*/${config.tickIntervalMinutes} * * * *`;

  console.log(`[SCHEDULER] World tick scheduled every ${config.tickIntervalMinutes} minutes (${expression})`);

  cron.schedule(expression, async () => {
    if (isRunning) {
      console.log('[SCHEDULER] Previous tick still running, skipping...');
      return;
    }
    isRunning = true;
    try {
      await executeTick();
    } catch (err) {
      console.error('[SCHEDULER] Tick failed:', err);
    } finally {
      isRunning = false;
    }
  });

  console.log('[SCHEDULER] Scheduler started');
}
