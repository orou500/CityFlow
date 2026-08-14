import SizopsOutbox from '../models/SizopsOutbox.js';
import SizopsAuditLog from '../models/SizopsAuditLog.js';
import { unregisterGamePlayer } from './sizopsOidc.js';

export const SIZOPS_DISCONNECT_BATCH_SIZE = 50;
const RETRY_BASE_MS = 60 * 1000;

/**
 * Enqueues a remote GamePlayer unregistration for a SizOps user id. The local
 * CityFlow unlink already happened; this is the durable intent to remove the
 * CityFlow connection on the SizOps side. Idempotent per (user, event, status):
 * if a pending or in-flight record already exists for the same user, it is not
 * duplicated.
 */
export async function enqueueSizopsDisconnect(sizopsUserId) {
  if (!sizopsUserId) return null;
  const existing = await SizopsOutbox.findOne({
    sizopsUserId,
    event: 'disconnect',
    status: { $in: ['pending', 'done'] },
  });
  if (existing) return existing;

  const record = await SizopsOutbox.create({
    sizopsUserId,
    event: 'disconnect',
    status: 'pending',
    nextAttemptAt: new Date(),
  });
  return record;
}

/**
 * Processes due disconnect outbox records: calls SizOps to remove the CityFlow
 * GamePlayer. Success marks the record `done` and writes an audit event;
 * failure increments attempts, backs off and writes an audit event so the
 * failure is observable and retryable. Never throws — errors are contained per
 * record.
 */
export async function processSizopsDisconnectOutbox(batchSize = SIZOPS_DISCONNECT_BATCH_SIZE) {
  const due = await SizopsOutbox.find({
    status: 'pending',
    nextAttemptAt: { $lte: new Date() },
  })
    .sort({ createdAt: 1 })
    .limit(batchSize);

  let processed = 0;
  for (const record of due) {
    record.attempts += 1;
    record.lastAttemptAt = new Date();

    let ok = false;
    let error = '';
    try {
      ok = await unregisterGamePlayer(record.sizopsUserId);
      if (!ok) error = 'SizOps game API reported a failure';
    } catch (err) {
      error = err.message || 'unknown error';
    }

    if (ok) {
      record.status = 'done';
      record.completedAt = new Date();
      record.lastError = '';
      await SizopsAuditLog.create({
        userId: null,
        action: 'sizops.disconnect_notify',
        details: { sizopsUserId: `****${String(record.sizopsUserId).slice(-4)}`, event: record.event },
      }).catch((err) => console.error(`[SIZOPS] Audit write failed (disconnect_notify): ${err.message}`));
    } else {
      record.status = record.attempts >= record.maxAttempts ? 'failed' : 'pending';
      record.lastError = error;
      const backoffMs = RETRY_BASE_MS * 2 ** Math.min(record.attempts - 1, 6);
      record.nextAttemptAt = new Date(Date.now() + backoffMs);
      await SizopsAuditLog.create({
        userId: null,
        action: 'sizops.disconnect_notify_failed',
        details: {
          sizopsUserId: `****${String(record.sizopsUserId).slice(-4)}`,
          event: record.event,
          attempts: record.attempts,
          error,
        },
      }).catch((err) => console.error(`[SIZOPS] Audit write failed (disconnect_notify_failed): ${err.message}`));
    }

    await record.save();
    processed += 1;
  }

  return processed;
}

export async function getPendingSizopsDisconnects() {
  return SizopsOutbox.countDocuments({ status: { $in: ['pending', 'failed'] } });
}
