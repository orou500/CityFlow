import { isRedisConnected, getRedis } from '../config/redis.js';

const store = new Map();

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

const cleanupInterval = setInterval(cleanup, 60_000);
if (cleanupInterval.unref) cleanupInterval.unref();

async function redisRateLimit(key, windowMs, max) {
  const redis = getRedis();
  const now = Date.now();
  const windowKey = `rl:${key}`;

  try {
    const multi = redis.multi();
    multi.zremrangebyscore(windowKey, 0, now - windowMs);
    multi.zadd(windowKey, now, `${now}:${Math.random()}`);
    multi.zcard(windowKey);
    multi.pexpire(windowKey, windowMs);

    const results = await multi.exec();
    const count = results[2][1];

    const remaining = Math.max(0, max - count);
    const oldest = await redis.zrange(windowKey, 0, 0, 'WITHSCORES');
    const resetAt = oldest.length >= 2 ? Number(oldest[1]) + windowMs : now + windowMs;
    const retryAfter = Math.max(0, Math.ceil((resetAt - now) / 1000));

    return { allowed: count <= max, remaining, resetAt, retryAfter, count };
  } catch {
    return null;
  }
}

export function rateLimit({ windowMs = 900_000, max = 5, keyPrefix = 'rl', message } = {}) {
  return async (req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next();

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;

    if (isRedisConnected()) {
      const result = await redisRateLimit(key, windowMs, max);
      if (result) {
        res.set('X-RateLimit-Limit', String(max));
        res.set('X-RateLimit-Remaining', String(result.remaining));
        res.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

        if (!result.allowed) {
          res.set('Retry-After', String(result.retryAfter));
          return res.status(429).json({
            error: message || 'Too many requests. Please try again later.',
            retryAfter: result.retryAfter,
          });
        }
        return next();
      }
    }

    // In-memory fallback
    const now = Date.now();
    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, max - entry.count);
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: message || 'Too many requests. Please try again later.',
        retryAfter,
      });
    }

    next();
  };
}
