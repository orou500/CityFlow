import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Notification from '../../models/Notification.js';
import {
  createNotification,
  bulkCreateNotifications,
  enqueueNotification,
  processNotificationQueue,
  getNotificationQueueSize,
} from '../../utils/notificationQueue.js';
import { createTestUser } from '../../test/helpers.js';

/**
 * Regression tests for the "deleted notifications reappear" bug.
 *
 * Root cause: `createNotification()` used to push a copy of every notification
 * onto the Redis `notifications:queue` list. The scheduler drained that queue
 * once per minute by calling `createNotification()` again — which upserts on
 * (userId, eventKey). If the user had deleted the notification, the upsert
 * re-inserted it and re-emitted `notification:new` every minute.
 *
 * The fix: the Redis queue is no longer a write path. `createNotification` /
 * `bulkCreateNotifications` persist directly to MongoDB (socket delivery
 * happens there too), and `processNotificationQueue` only drains stale items
 * left behind by older versions — it must NEVER re-create them.
 */
const redisState = vi.hoisted(() => {
  const store = new Map();
  const queue = [];
  return { store, queue };
});

vi.mock('../../config/redis.js', () => {
  function makeClient() {
    return {
      get: async (key) => (redisState.store.has(key) ? redisState.store.get(key) : null),
      set: async (key, value) => {
        redisState.store.set(key, value);
        return 'OK';
      },
      del: async (...keys) => {
        let n = 0;
        for (const k of keys.flat()) {
          if (redisState.store.delete(k)) n++;
        }
        return n;
      },
      exists: async (...keys) => keys.flat().filter((k) => redisState.store.has(k)).length,
      mget: async (...keys) => keys.flat().map((k) => (redisState.store.has(k) ? redisState.store.get(k) : null)),
      scan: async () => ['0', []],
      lpop: async () => (redisState.queue.length ? redisState.queue.shift() : null),
      rpush: async (...items) => {
        redisState.queue.push(...items.flat());
        return redisState.queue.length;
      },
      llen: async () => redisState.queue.length,
      publish: async () => 0,
      subscribe: async () => 1,
      unsubscribe: async () => 1,
      on: () => {},
      quit: async () => 'OK',
    };
  }

  return {
    createRedisClient: makeClient,
    getRedis: () => makeClient(),
    isRedisConnected: () => true,
    connectRedis: async () => makeClient(),
    disconnectRedis: async () => {},
  };
});

describe('Notification resurrection — deleted notifications must stay deleted', () => {
  beforeAll(async () => {
    await Notification.deleteMany({});
  });

  afterAll(async () => {
    await Notification.deleteMany({});
  });

  function payloadFor(user, key) {
    return {
      userId: user._id,
      type: 'system',
      title: 'Gone',
      message: 'should never come back',
      eventKey: key,
      entityType: 'test',
      route: '/dashboard',
      global: false,
    };
  }

  it('a stale queue copy of a deleted notification is drained, never re-inserted', async () => {
    const user = await createTestUser();
    const key = `test:resurrect:${user._id}:1`;
    const payload = payloadFor(user, key);

    const { created, notification } = await createNotification(payload);
    expect(created).toBe(true);

    // User deletes it.
    await Notification.deleteOne({ _id: notification._id });
    expect(await Notification.countDocuments({ eventKey: key })).toBe(0);

    // A stale copy from an older version is still sitting in the Redis queue.
    redisState.queue.push(JSON.stringify({ ...payload, _id: notification._id.toString() }));
    expect(await getNotificationQueueSize()).toBe(1);

    const drained = await processNotificationQueue();
    expect(drained).toBe(1);
    expect(await getNotificationQueueSize()).toBe(0);

    // It must NOT come back — the drain is a discard, not a re-create.
    expect(await Notification.countDocuments({ eventKey: key })).toBe(0);
  });

  it('createNotification no longer enqueues to the Redis queue', async () => {
    const user = await createTestUser();
    const key = `test:noqueue:${user._id}:1`;

    const { created } = await createNotification(payloadFor(user, key));
    expect(created).toBe(true);
    expect(redisState.queue.length).toBe(0);
    expect(await getNotificationQueueSize()).toBe(0);
  });

  it('enqueueNotification wrapper no longer enqueues to the Redis queue', async () => {
    const user = await createTestUser();
    const key = `test:noqueue:${user._id}:2`;

    const { created } = await enqueueNotification(payloadFor(user, key));
    expect(created).toBe(true);
    expect(redisState.queue.length).toBe(0);
  });

  it('bulkCreateNotifications no longer enqueues to the Redis queue', async () => {
    const user = await createTestUser();
    const key = `test:noqueue:${user._id}:3`;

    const { created } = await bulkCreateNotifications([payloadFor(user, key)]);
    expect(created).toBe(1);
    expect(redisState.queue.length).toBe(0);
    expect(await getNotificationQueueSize()).toBe(0);
  });

  it('draining a stale copy for an existing notification never creates a duplicate', async () => {
    const user = await createTestUser();
    const key = `test:dedup:${user._id}:1`;

    const { created } = await createNotification(payloadFor(user, key));
    expect(created).toBe(true);

    redisState.queue.push(JSON.stringify(payloadFor(user, key)));
    await processNotificationQueue();

    expect(await Notification.countDocuments({ eventKey: key })).toBe(1);
  });

  it('delete during concurrent duplicate creates → one doc max, and a later drain cannot resurrect', async () => {
    const user = await createTestUser();
    const key = `test:race:${user._id}:1`;

    const results = await Promise.all(Array.from({ length: 5 }, () => createNotification(payloadFor(user, key))));
    expect(results.filter((r) => r.created).length).toBe(1);
    expect(await Notification.countDocuments({ eventKey: key })).toBe(1);

    // User deletes it (the pre-check race: they saw it arrive, now it's gone).
    await Notification.deleteMany({ eventKey: key });
    expect(await Notification.countDocuments({ eventKey: key })).toBe(0);

    // Multiple stale copies queued concurrently by the old engine path.
    redisState.queue.push(JSON.stringify(payloadFor(user, key)));
    redisState.queue.push(JSON.stringify(payloadFor(user, key)));
    const drained = await processNotificationQueue();
    expect(drained).toBe(2);

    expect(await Notification.countDocuments({ eventKey: key })).toBe(0);
  });

  it('processNotificationQueue drains up to BATCH_SIZE items', async () => {
    const user = await createTestUser();
    for (let i = 0; i < 60; i++) {
      redisState.queue.push(`stale:${user._id}:${i}`);
    }

    const drainedFirstRun = await processNotificationQueue();
    expect(drainedFirstRun).toBe(50);
    expect(await getNotificationQueueSize()).toBe(10);

    const drainedSecondRun = await processNotificationQueue();
    expect(drainedSecondRun).toBe(10);
    expect(await getNotificationQueueSize()).toBe(0);
  });
});
