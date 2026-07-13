const store = new Map();

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

setInterval(cleanup, 60_000);

export function rateLimit({ windowMs = 900_000, max = 5, keyPrefix = 'rl', message } = {}) {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next();

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const key = `${keyPrefix}:${ip}`;

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
