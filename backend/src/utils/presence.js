import { isRedisConnected, getRedis } from '../config/redis.js';

const PREFIX = 'presence:';
const DEFAULT_TTL = 30;
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

export const STATUS = {
  ONLINE: 'online',
  IDLE: 'idle',
  OFFLINE: 'offline',
};

export async function setOnline(userId, socketId) {
  if (!isRedisConnected()) return;
  const redis = getRedis();
  const key = `${PREFIX}${userId}`;
  try {
    await redis.set(
      key,
      JSON.stringify({ status: STATUS.ONLINE, socketId, lastSeen: Date.now(), lastActivity: Date.now() }),
      'EX',
      DEFAULT_TTL,
    );
  } catch (err) {
    console.error('[PRESENCE] setOnline error:', err.message);
  }
}

export async function touch(userId) {
  if (!isRedisConnected()) return;
  const redis = getRedis();
  const key = `${PREFIX}${userId}`;
  try {
    const data = await redis.get(key);
    if (data) {
      const parsed = JSON.parse(data);
      parsed.lastActivity = Date.now();
      if (parsed.status === STATUS.IDLE) parsed.status = STATUS.ONLINE;
      await redis.set(key, JSON.stringify(parsed), 'EX', DEFAULT_TTL);
    }
  } catch (err) {
    console.error('[PRESENCE] touch error:', err.message);
  }
}

export async function setOffline(userId) {
  if (!isRedisConnected()) return;
  const redis = getRedis();
  const key = `${PREFIX}${userId}`;
  try {
    const data = await redis.get(key);
    const parsed = data ? JSON.parse(data) : {};
    await redis.set(key, JSON.stringify({ ...parsed, status: STATUS.OFFLINE, lastSeen: Date.now() }), 'EX', 300);
  } catch (err) {
    console.error('[PRESENCE] setOffline error:', err.message);
  }
}

export async function getStatus(userId) {
  if (!isRedisConnected()) return { status: STATUS.OFFLINE, lastSeen: null };
  const redis = getRedis();
  const key = `${PREFIX}${userId}`;
  try {
    const data = await redis.get(key);
    if (!data) return { status: STATUS.OFFLINE, lastSeen: null };
    const parsed = JSON.parse(data);
    if (parsed.status !== STATUS.OFFLINE && Date.now() - parsed.lastActivity > IDLE_THRESHOLD_MS) {
      parsed.status = STATUS.IDLE;
    }
    return parsed;
  } catch {
    return { status: STATUS.OFFLINE, lastSeen: null };
  }
}

export async function getMultipleStatuses(userIds) {
  if (!isRedisConnected() || userIds.length === 0) {
    return userIds.map((id) => ({ userId: id, status: STATUS.OFFLINE, lastSeen: null }));
  }
  const redis = getRedis();
  const keys = userIds.map((id) => `${PREFIX}${id}`);
  try {
    const results = await redis.mget(...keys);
    return userIds.map((id, i) => {
      if (!results[i]) return { userId: id, status: STATUS.OFFLINE, lastSeen: null };
      const parsed = JSON.parse(results[i]);
      if (parsed.status !== STATUS.OFFLINE && Date.now() - parsed.lastActivity > IDLE_THRESHOLD_MS) {
        parsed.status = STATUS.IDLE;
      }
      return { userId: id, ...parsed };
    });
  } catch {
    return userIds.map((id) => ({ userId: id, status: STATUS.OFFLINE, lastSeen: null }));
  }
}

export async function heartbeat(userId, socketId) {
  if (!isRedisConnected()) return;
  const redis = getRedis();
  const key = `${PREFIX}${userId}`;
  try {
    const data = await redis.get(key);
    const parsed = data ? JSON.parse(data) : {};
    await redis.set(
      key,
      JSON.stringify({ ...parsed, status: STATUS.ONLINE, socketId, lastSeen: Date.now(), lastActivity: Date.now() }),
      'EX',
      DEFAULT_TTL,
    );
  } catch (err) {
    console.error('[PRESENCE] heartbeat error:', err.message);
  }
}

export async function getOnlineCount() {
  if (!isRedisConnected()) return 0;
  const redis = getRedis();
  try {
    let count = 0;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${PREFIX}*`, 'COUNT', 100);
      cursor = nextCursor;
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          if (parsed.status === STATUS.ONLINE || parsed.status === STATUS.IDLE) count++;
        }
      }
    } while (cursor !== '0');
    return count;
  } catch {
    return 0;
  }
}
