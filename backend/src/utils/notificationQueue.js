import crypto from 'crypto';
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

function computeEventId(data) {
  const raw = `${data.userId || ''}|${data.type || ''}|${data.title || ''}|${data.message || ''}|${data.relatedId || ''}`;
  return crypto.createHash('md5').update(raw).digest('hex');
}

export async function enqueueNotification(notificationData) {
  const userId = getUserId(notificationData);
  const eventId = computeEventId(notificationData);
  const doc = { ...notificationData, eventId };

  try {
    await Notification.create(doc);
  } catch (err) {
    if (err.code === 11000) {
      return true;
    }
    console.error('[NOTIF] Create error:', err.message);
    return false;
  }

  if (userId) {
    onNotificationCreated(userId).catch(() => {});
  }

  if (isRedisConnected()) {
    try {
      const redis = getRedis();
      const queueLen = await redis.llen(QUEUE_KEY);
      if (queueLen < MAX_QUEUE_SIZE) {
        await redis.rpush(QUEUE_KEY, JSON.stringify(doc));
      }
    } catch (err) {
      console.error('[NOTIF] Redis enqueue error:', err.message);
    }
  }

  return true;
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
        await Notification.findOneAndUpdate(
          { eventId: notification.eventId },
          { $setOnInsert: notification },
          { upsert: true },
        );
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
