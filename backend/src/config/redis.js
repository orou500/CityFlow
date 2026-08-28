import Redis from 'ioredis';
import { config } from './index.js';

let client = null;
let isConnected = false;

export function createRedisClient() {
  if (client) return client;

  const opts = {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) {
        console.error('[REDIS] Max reconnection attempts reached');
        return null;
      }
      const delay = Math.min(times * 200, 5000);
      console.log(`[REDIS] Reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    lazyConnect: true,
  };

  if (config.redis.url) {
    client = new Redis(config.redis.url, {
      password: config.redis.password || undefined,
      ...opts,
    });
  } else {
    client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      ...opts,
    });
  }

  client.on('connect', () => {
    console.log('[REDIS] Connected');
    isConnected = true;
  });

  client.on('ready', () => {
    console.log('[REDIS] Ready');
  });

  client.on('error', (err) => {
    if (isConnected) {
      console.error('[REDIS] Error:', err.message);
    }
    isConnected = false;
  });

  client.on('close', () => {
    isConnected = false;
  });

  return client;
}

export async function connectRedis() {
  const redis = createRedisClient();
  try {
    await redis.connect();
    isConnected = true;
    return redis;
  } catch (err) {
    console.error('[REDIS] Connection failed:', err.message);
    console.warn('[REDIS] Application will continue without Redis. All caching features are disabled.');
    isConnected = false;
    return null;
  }
}

export function getRedis() {
  return client;
}

export function isRedisConnected() {
  return isConnected && client && client.status === 'ready';
}

export async function disconnectRedis() {
  if (client) {
    await client.quit();
    client = null;
    isConnected = false;
  }
}
