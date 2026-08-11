import Notification from '../models/Notification.js';
import { READ_RETENTION_DAYS, CRITICAL_READ_RETENTION_DAYS, PRIORITY } from '../config/notificationConfig.js';

let retentionRunning = false;

/**
 * Delete read notifications older than the retention window.
 *
 * - Regular read notifications are purged after READ_RETENTION_DAYS (7).
 * - Read CRITICAL notifications are kept longer (30 days) so important
 *   records (auction wins, loans, hazards) survive routine cleanup.
 * - Unread notifications are NEVER auto-deleted here.
 *
 * Runs from a scheduled job AND opportunistically from GET /notifications so
 * the database never grows without bound. Guarded against concurrent runs.
 */
export async function runNotificationRetention(force = false) {
  if (retentionRunning && !force) return { removed: 0, skipped: true };
  retentionRunning = true;

  try {
    const now = Date.now();
    const standardCutoff = new Date(now - READ_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const criticalCutoff = new Date(now - CRITICAL_READ_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const removed = await Notification.deleteMany({
      read: true,
      readAt: { $exists: true, $lt: standardCutoff },
      $or: [{ priority: { $ne: PRIORITY.CRITICAL } }, { priority: PRIORITY.CRITICAL, readAt: { $lt: criticalCutoff } }],
    });

    // Legacy rows (no readAt) fall back to updatedAt so old data is still pruned.
    const legacy = await Notification.deleteMany({
      read: true,
      readAt: { $exists: false },
      updatedAt: { $lt: standardCutoff },
      priority: { $ne: PRIORITY.CRITICAL },
    });

    return { removed: removed.deletedCount + legacy.deletedCount, skipped: false };
  } catch (err) {
    console.error('[NOTIF] Retention error:', err.message);
    return { removed: 0, skipped: false, error: err.message };
  } finally {
    retentionRunning = false;
  }
}
