import crypto from 'crypto';
import mongoose from 'mongoose';
import { isRedisConnected, getRedis } from '../config/redis.js';
import Notification from '../models/Notification.js';
import { onNotificationCreated } from './cacheInvalidation.js';

const QUEUE_KEY = 'notifications:queue';
const MAX_QUEUE_SIZE = 10000;
const BATCH_SIZE = 50;

function getUserId(notificationData) {
  const uid = notificationData.userId;
  if (!uid) return null;
  return typeof uid === 'object' && uid.toString ? uid.toString() : uid;
}

/**
 * Derive a stable idempotency key for a logical event.
 *
 * Callers should pass an explicit `eventKey` (e.g. "mission:65f0..:completed").
 * When absent, a structural fallback is computed from type + entity ids so
 * distinct events never collide and the same event always produces the same
 * key. The fallback is deliberately free of title/message content: message
 * text changes (amounts, names, wording) must never create duplicates, and
 * identical text for different events must never suppress a notification.
 */
function computeEventKey(data) {
  const parts = [data.type];
  if (data.entityType) parts.push(data.entityType);
  const entityId = data.entityId || data.relatedId;
  if (entityId) parts.push(String(entityId));
  else if (data.userId) parts.push(`user:${data.userId}`);
  return parts.join(':');
}

export function resolveEventKey(data) {
  if (data.eventKey) return String(data.eventKey);
  return computeEventKey(data);
}

function computeEventId(eventKey) {
  return crypto.createHash('md5').update(String(eventKey)).digest('hex');
}

/**
 * Atomically create a notification for a logical event — at most one per
 * (user, eventKey). The unique partial index on (userId, eventKey) is the
 * final protection: concurrent calls, engine retries, tick re-runs, HTTP
 * retries and socket reconnects can never produce a second DB record.
 *
 * Returns { created, notification }. `created` is false when the event was
 * already recorded (e.g. a tick retry after a crash) — callers should only
 * emit socket events / award side effects on `created === true` if the side
 * effect itself is not idempotent.
 */
export async function createNotification(notificationData) {
  const userId = getUserId(notificationData);
  const eventKey = resolveEventKey(notificationData);
  const candidate = {
    ...notificationData,
    eventKey,
    // Legacy eventId index is global (not per-user): include the userId so
    // the same event key fanned out to multiple users never collides.
    eventId: computeEventId(`${userId || ''}|${eventKey}`),
    _id: new mongoose.Types.ObjectId(),
  };

  let doc;
  try {
    doc = await Notification.findOneAndUpdate(
      { userId: notificationData.userId ?? null, eventKey },
      { $setOnInsert: candidate },
      { upsert: true, new: true },
    );
  } catch (err) {
    if (err.code === 11000) {
      doc = await Notification.findOne({ userId: notificationData.userId ?? null, eventKey }).lean();
      return { created: false, notification: doc || null };
    }
    console.error('[NOTIF] Create error:', err.message);
    return { created: false, notification: null, error: err };
  }

  const created = doc._id.equals(candidate._id);

  if (created && userId) {
    onNotificationCreated(userId).catch(() => {});
  }

  if (isRedisConnected()) {
    try {
      const redis = getRedis();
      const queueLen = await redis.llen(QUEUE_KEY);
      if (queueLen < MAX_QUEUE_SIZE) {
        await redis.rpush(QUEUE_KEY, JSON.stringify({ ...candidate, _id: doc._id.toString() }));
      }
    } catch (err) {
      console.error('[NOTIF] Redis enqueue error:', err.message);
    }
  }

  return { created, notification: doc };
}

/** Backward-compatible wrapper used by all existing call sites. */
export async function enqueueNotification(notificationData) {
  return createNotification(notificationData);
}

export async function processNotificationQueue() {
  if (!isRedisConnected()) return 0;

  const redis = getRedis();
  let processed = 0;

  try {
    while (processed < BATCH_SIZE) {
      const data = await redis.lpop(QUEUE_KEY);
      if (!data) break;

      try {
        const notification = JSON.parse(data);
        await createNotification(notification);
        processed++;
      } catch (err) {
        console.error('[NOTIF QUEUE] Process error:', err.message);
      }
    }
  } catch (err) {
    console.error('[NOTIF QUEUE] Batch error:', err.message);
  }

  return processed;
}

export async function getNotificationQueueSize() {
  if (!isRedisConnected()) return 0;
  try {
    return await getRedis().llen(QUEUE_KEY);
  } catch {
    return 0;
  }
}
