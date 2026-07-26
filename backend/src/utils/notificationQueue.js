import { isRedisConnected, getRedis } from '../config/redis.js';
import Notification from '../models/Notification.js';

const QUEUE_KEY = 'notifications:queue';
const MAX_QUEUE_SIZE = 10000;
const BATCH_SIZE = 50;

export async function enqueueNotification(notificationData) {
  if (!isRedisConnected()) {
    await Notification.create(notificationData);
    return true;
  }

  const redis = getRedis();
  try {
    const queueLen = await redis.llen(QUEUE_KEY);
    if (queueLen >= MAX_QUEUE_SIZE) {
      console.warn('[NOTIF QUEUE] Queue full, dropping notification');
      return false;
    }

    await redis.rpush(QUEUE_KEY, JSON.stringify(notificationData));
    return true;
  } catch (err) {
    console.error('[NOTIF QUEUE] Enqueue error:', err.message);
    await Notification.create(notificationData);
    return true;
  }
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
        await Notification.create(notification);
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
