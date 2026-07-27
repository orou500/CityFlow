import cron from 'node-cron';
import crypto from 'crypto';
import { executeTick } from './tick.js';
import { acquireTickLock, releaseTickLock } from '../models/GameState.js';
import { createBackup, enforceRetention } from './backup.js';
import { config } from '../config/index.js';
import { processNotificationQueue } from '../utils/notificationQueue.js';
import { reconcilePendingDonations } from '../routes/donations.js';

const ownerId = crypto.randomUUID();

const BACKUP_SCHEDULES = {
  daily: '0 2 * * *',
  weekly: '0 2 * * 0',
  monthly: '0 2 1 * *',
};

export function startScheduler() {
  const expression = '0 0,6,12,18 * * *';

  console.log('[SCHEDULER] World tick scheduled at 00:00, 06:00, 12:00, 18:00');
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

  if (config.backupSchedule && BACKUP_SCHEDULES[config.backupSchedule]) {
    const scheduleExpr = BACKUP_SCHEDULES[config.backupSchedule];
    console.log(`[SCHEDULER] Backup schedule: ${config.backupSchedule} (${scheduleExpr})`);

    cron.schedule(scheduleExpr, async () => {
      try {
        console.log('[SCHEDULER] Running scheduled backup...');
        await createBackup(null, 'scheduled');
        await enforceRetention();
      } catch (err) {
        console.error('[SCHEDULER] Scheduled backup failed:', err);
      }
    });
  }

  cron.schedule('* * * * *', async () => {
    try {
      const processed = await processNotificationQueue();
      if (processed > 0) {
        console.log(`[SCHEDULER] Processed ${processed} queued notifications`);
      }
    } catch (err) {
      console.error('[SCHEDULER] Notification queue processing failed:', err.message);
    }
  });

  cron.schedule('*/5 * * * *', async () => {
    try {
      await reconcilePendingDonations();
    } catch (err) {
      console.error('[SCHEDULER] Donation reconciliation failed:', err.message);
    }
  });

  console.log('[SCHEDULER] Scheduler started');
}
