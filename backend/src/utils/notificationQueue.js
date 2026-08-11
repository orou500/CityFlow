import crypto from 'crypto';
import mongoose from 'mongoose';
import { isRedisConnected, getRedis } from '../config/redis.js';
import Notification from '../models/Notification.js';
import { onNotificationCreated } from './cacheInvalidation.js';
import {
  resolveNotificationMeta,
  PRIORITY,
  MAX_UNREAD_NOTIFICATIONS,
} from '../config/notificationConfig.js';
import { isNotificationAllowed } from './notificationPreferences.js';

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

function buildCandidate(notificationData) {
  const userId = getUserId(notificationData);
  const eventKey = resolveEventKey(notificationData);
  const { priority, category } = resolveNotificationMeta(notificationData);
  return {
    ...notificationData,
    priority,
    category,
    eventKey,
    // Legacy eventId index is global (not per-user): include the userId so
    // the same event key fanned out to multiple users never collides.
    eventId: computeEventId(`${userId || ''}|${eventKey}`),
    _id: new mongoose.Types.ObjectId(),
  };
}

/**
 * Atomically create a notification for a logical event — at most one per
 * (user, eventKey). The unique partial index on (userId, eventKey) is the
 * final protection: concurrent calls, engine retries, tick re-runs, HTTP
 * retries and socket reconnects can never produce a second DB record.
 *
 * opts.merge — update the existing notification's title/message instead of
 * only inserting when a record for the same (user, eventKey) already exists.
 * Used by recurring reminders that should stay as ONE notification (e.g.
 * "rent ready to collect" refreshing its amount). Merges never re-emit a
 * socket event, so they can't spam the client.
 *
 * Returns { created, notification, skipped }. `created` is false when the
 * event was already recorded (e.g. a tick retry after a crash) — callers
 * should only emit socket events / award side effects on `created === true`.
 * `skipped` is true when the user's category preference suppresses it.
 */
export async function createNotification(notificationData, opts = {}) {
  const userId = getUserId(notificationData);
  const { priority, category } = resolveNotificationMeta(notificationData);

  if (userId && !(await isNotificationAllowed(userId, priority, category))) {
    return { created: false, notification: null, skipped: true };
  }

  // High-volume protection: drop NEW low-priority notifications for users
  // already sitting at/over the unread cap. Critical/high always pass.
  if (userId && priority === PRIORITY.LOW) {
    const unread = await Notification.countDocuments({ userId, read: false });
    if (unread >= MAX_UNREAD_NOTIFICATIONS) {
      return { created: false, notification: null, skipped: true };
    }
  }

  const candidate = buildCandidate(notificationData);
  const filter = { userId: notificationData.userId ?? null, eventKey: candidate.eventKey };
  // title/message must not appear in BOTH $setOnInsert and $set (MongoDB
  // rejects conflicting paths); move them to $set so merges refresh the text.
  const setOnInsert = opts.merge ? { ...candidate } : candidate;
  if (opts.merge) {
    delete setOnInsert.title;
    delete setOnInsert.message;
  }
  const update = opts.merge
    ? { $setOnInsert: setOnInsert, $set: { title: candidate.title, message: candidate.message } }
    : { $setOnInsert: candidate };

  let doc;
  try {
    doc = await Notification.findOneAndUpdate(filter, update, { upsert: true, new: true });
  } catch (err) {
    if (err.code === 11000) {
      doc = await Notification.findOne(filter).lean();
      return { created: false, notification: doc || null, skipped: false };
    }
    console.error('[NOTIF] Create error:', err.message);
    return { created: false, notification: null, error: err, skipped: false };
  }

  const created = doc._id.equals(candidate._id);

  if (created && userId) {
    onNotificationCreated(userId, doc).catch(() => {});
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

  return { created, notification: doc, skipped: false };
}

/** Backward-compatible wrapper used by all existing call sites. */
export async function enqueueNotification(notificationData, opts = {}) {
  return createNotification(notificationData, opts);
}

/**
 * Bulk-create notifications (fan-outs, tick-generated events, engine loops).
 *
 * - Deduplication is the same DB-level unique (userId, eventKey) guard; a
 *   bulkWrite with ordered:false simply skips duplicates.
 * - Category preferences are checked once per user.
 * - LOW-priority items are dropped for users who already have a very large
 *   unread list (high-volume protection) — one count query per batch.
 * - Socket events fire only for records that were actually inserted.
 *
 * Returns { created, duplicates, skipped, inserted, results }.
 */
export async function bulkCreateNotifications(items = [], opts = {}) {
  if (items.length === 0) return { created: 0, duplicates: 0, skipped: 0, inserted: [], results: [] };

  // Category preference gating — one cached lookup per distinct user.
  const allowedMap = new Map();
  await Promise.all(
    items.map(async (data) => {
      const uid = getUserId(data);
      const { priority, category } = resolveNotificationMeta(data);
      if (!uid || priority === PRIORITY.CRITICAL) {
        allowedMap.set(data, true);
        return;
      }
      const prefsAllowed = await isNotificationAllowed(uid, priority, category);
      allowedMap.set(data, prefsAllowed);
    }),
  );

  // LOW-priority unread cap — count once per batch per user.
  const unreadOverCap = new Set();
  const cappedUsers = new Set(items.filter((d) => resolveNotificationMeta(d).priority === PRIORITY.LOW).map((d) => getUserId(d)).filter(Boolean));
  if (cappedUsers.size > 0) {
    const agg = await Notification.aggregate([
      { $match: { userId: { $in: [...cappedUsers] }, read: false } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);
    for (const row of agg) {
      if (row.count >= MAX_UNREAD_NOTIFICATIONS) unreadOverCap.add(row._id.toString());
    }
  }

  const ops = [];
  const candidates = [];
  for (const data of items) {
    const uid = getUserId(data);
    const { priority } = resolveNotificationMeta(data);
    const isLow = priority === PRIORITY.LOW;

    if (allowedMap.get(data) === false) {
      continue;
    }
    if (uid && isLow && unreadOverCap.has(uid)) {
      continue;
    }

    const candidate = buildCandidate(data);
    candidates.push(candidate);
    const setOnInsert = opts.merge ? { ...candidate } : candidate;
    if (opts.merge) {
      delete setOnInsert.title;
      delete setOnInsert.message;
    }
    ops.push({
      updateOne: {
        filter: { userId: data.userId ?? null, eventKey: candidate.eventKey },
        update: opts.merge
          ? { $setOnInsert: setOnInsert, $set: { title: candidate.title, message: candidate.message } }
          : { $setOnInsert: candidate },
        upsert: true,
      },
    });
  }

  if (ops.length === 0) return { created: 0, duplicates: 0, skipped: items.length, inserted: [], results: [] };

  let result;
  try {
    result = await Notification.bulkWrite(ops, { ordered: false });
  } catch (err) {
    console.error('[NOTIF] Bulk create error:', err.message);
    return { created: 0, duplicates: ops.length, skipped: 0, inserted: [], results: [], error: err };
  }

  // upsertedIds maps operation index -> inserted _id for rows that were NEW.
  const insertedCandidates = [];
  const insertedIds = result.upsertedIds || {};
  for (const idxStr of Object.keys(insertedIds)) {
    const candidate = candidates[Number(idxStr)];
    if (candidate) {
      insertedCandidates.push(candidate);
      const uid = getUserId(candidate);
      if (uid) {
        onNotificationCreated(uid, candidate).catch(() => {});
      }
    }
  }

  if (isRedisConnected()) {
    try {
      const redis = getRedis();
      const queueLen = await redis.llen(QUEUE_KEY);
      const room = Math.max(0, MAX_QUEUE_SIZE - queueLen);
      const toPush = insertedCandidates.slice(0, room);
      if (toPush.length > 0) {
        await redis.rpush(QUEUE_KEY, ...toPush.map((c) => JSON.stringify({ ...c, _id: c._id.toString() })));
      }
    } catch (err) {
      console.error('[NOTIF] Redis enqueue error:', err.message);
    }
  }

  const created = insertedCandidates.length;
  const duplicates = Math.max(0, ops.length - created);

  return {
    created,
    duplicates,
    skipped: items.length - ops.length,
    inserted: insertedCandidates,
    results: insertedCandidates.map((c) => ({ created: true, notification: c })),
  };
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
