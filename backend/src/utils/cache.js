import { isRedisConnected, getRedis } from '../config/redis.js';

const DEFAULT_TTL = 60;
const metrics = { hits: 0, misses: 0, sets: 0, deletes: 0 };

export function getCacheMetrics() {
  return { ...metrics };
}

export function resetCacheMetrics() {
  metrics.hits = 0;
  metrics.misses = 0;
  metrics.sets = 0;
  metrics.deletes = 0;
}

export async function cacheGet(key) {
  if (!isRedisConnected()) return null;
  try {
    const data = await getRedis().get(key);
    if (data !== null) {
      metrics.hits++;
      return JSON.parse(data);
    }
    metrics.misses++;
    return null;
  } catch (err) {
    console.error(`[CACHE] GET ${key} error:`, err.message);
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = DEFAULT_TTL) {
  if (!isRedisConnected()) return false;
  try {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds);
    metrics.sets++;
    return true;
  } catch (err) {
    console.error(`[CACHE] SET ${key} error:`, err.message);
    return false;
  }
}

export async function cacheDel(key) {
  if (!isRedisConnected()) return false;
  try {
    await getRedis().del(key);
    metrics.deletes++;
    return true;
  } catch (err) {
    console.error(`[CACHE] DEL ${key} error:`, err.message);
    return false;
  }
}

export async function cacheDelPattern(pattern) {
  if (!isRedisConnected()) return false;
  try {
    const redis = getRedis();
    const keys = [];
    let cursor = '0';
    do {
      const [nextCursor, foundKeys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');

    if (keys.length > 0) {
      await redis.del(...keys);
      metrics.deletes += keys.length;
    }
    return true;
  } catch (err) {
    console.error(`[CACHE] DEL pattern ${pattern} error:`, err.message);
    return false;
  }
}

export async function cacheGetOrSet(key, fetchFn, ttlSeconds = DEFAULT_TTL) {
  const cached = await cacheGet(key);
  if (cached !== null) return cached;
  const value = await fetchFn();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

export async function cacheMget(keys) {
  if (!isRedisConnected() || keys.length === 0) return keys.map(() => null);
  try {
    const results = await getRedis().mget(...keys);
    return results.map((data) => {
      if (data !== null) {
        metrics.hits++;
        return JSON.parse(data);
      }
      metrics.misses++;
      return null;
    });
  } catch (err) {
    console.error('[CACHE] MGET error:', err.message);
    return keys.map(() => null);
  }
}

export async function cacheDelMany(keys) {
  if (!isRedisConnected() || keys.length === 0) return false;
  try {
    const existing = await getRedis().exists(...keys);
    if (existing > 0) {
      await getRedis().del(...keys);
      metrics.deletes += existing;
    }
    return true;
  } catch (err) {
    console.error('[CACHE] DEL many error:', err.message);
    return false;
  }
}

export async function getCacheKeyCount() {
  if (!isRedisConnected()) return 0;
  try {
    let count = 0;
    let cursor = '0';
    do {
      const [nextCursor, foundKeys] = await getRedis().scan(cursor, 'MATCH', 'cf:*', 'COUNT', 100);
      cursor = nextCursor;
      count += foundKeys.length;
    } while (cursor !== '0');
    return count;
  } catch {
    return 0;
  }
}

export function getHitRate() {
  const total = metrics.hits + metrics.misses;
  return total > 0 ? ((metrics.hits / total) * 100).toFixed(1) + '%' : 'N/A';
}
