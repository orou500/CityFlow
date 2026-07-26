import { isRedisConnected, getRedis } from '../config/redis.js';

const LOCK_SUFFIX = ':lock';

export async function acquireLock(name, ttlMs = 300000) {
  if (!isRedisConnected()) return null;
  const key = `lock:${name}${LOCK_SUFFIX}`;
  const ownerId = crypto.randomUUID();
  const ttlSeconds = Math.ceil(ttlMs / 1000);

  try {
    const result = await getRedis().set(key, ownerId, 'EX', ttlSeconds, 'NX');
    if (result === 'OK') return ownerId;
    return null;
  } catch (err) {
    console.error(`[LOCK] Acquire ${name} error:`, err.message);
    return null;
  }
}

export async function releaseLock(name, ownerId) {
  if (!isRedisConnected()) return false;
  const key = `lock:${name}${LOCK_SUFFIX}`;

  try {
    const redis = getRedis();
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await redis.eval(script, 1, key, ownerId);
    return result === 1;
  } catch (err) {
    console.error(`[LOCK] Release ${name} error:`, err.message);
    return false;
  }
}

export async function isLockHeld(name) {
  if (!isRedisConnected()) return false;
  const key = `lock:${name}${LOCK_SUFFIX}`;
  try {
    const ttl = await getRedis().ttl(key);
    return ttl > 0;
  } catch {
    return false;
  }
}
