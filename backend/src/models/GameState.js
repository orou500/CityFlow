import mongoose from 'mongoose';
import { acquireLock, releaseLock } from '../utils/redisLock.js';
import { isRedisConnected } from '../config/redis.js';
import { cacheGet, cacheSet, cacheDel } from '../utils/cache.js';

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes — fallback for MongoDB lock
const REDIS_LOCK_KEY = 'tick';
const REDIS_LOCK_TTL_MS = 3 * 60 * 1000; // 3 minutes for Redis lock
const TICK_CACHE_KEY = 'cf:tick:state';
const TICK_CACHE_TTL = 5; // 5 seconds — short TTL for near-realtime tick data

const gameStateSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  tickNumber: { type: Number, default: 0 },
  lastTickAt: { type: Date },
  tickLock: { type: String, default: null },
  tickLockedAt: { type: Date, default: null },
  tickLockOwnerId: { type: String, default: null },
  seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', default: null },
  maintenanceMode: { type: Boolean, default: false },
  maintenanceMessage: { type: String, default: '' },
  maintenanceEnabledAt: { type: Date },
  maintenanceEnabledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

export async function getGameState() {
  let state = await mongoose.model('GameState').findOne({ key: 'global' });
  if (!state) {
    state = await mongoose.model('GameState').create({ key: 'global', tickNumber: 0 });
  }
  return state;
}

export async function getTickNumber() {
  const cached = await cacheGet(TICK_CACHE_KEY);
  if (cached?.tickNumber != null) return cached.tickNumber;

  const state = await getGameState();
  await cacheSet(TICK_CACHE_KEY, { tickNumber: state.tickNumber }, TICK_CACHE_TTL);
  return state.tickNumber;
}

export async function incrementTick() {
  const state = await mongoose
    .model('GameState')
    .findOneAndUpdate(
      { key: 'global' },
      { $inc: { tickNumber: 1 }, $set: { lastTickAt: new Date() } },
      { new: true, upsert: true },
    );
  await cacheDel(TICK_CACHE_KEY);
  return state.tickNumber;
}

export async function acquireTickLock(ownerId) {
  if (isRedisConnected()) {
    const lockOwnerId = await acquireLock(REDIS_LOCK_KEY, REDIS_LOCK_TTL_MS);
    if (lockOwnerId) {
      await mongoose
        .model('GameState')
        .findOneAndUpdate({ key: 'global' }, { $set: { tickLockOwnerId: lockOwnerId } }, { upsert: true });
      return true;
    }
    return false;
  }

  // MongoDB fallback when Redis is unavailable
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - LOCK_TTL_MS);
  const state = await mongoose.model('GameState').findOneAndUpdate(
    {
      key: 'global',
      $or: [{ tickLock: null }, { tickLockedAt: { $lt: staleThreshold } }],
    },
    {
      $set: { tickLock: ownerId, tickLockedAt: now },
    },
    { new: true },
  );
  return state !== null;
}

export async function releaseTickLock(ownerId) {
  if (isRedisConnected()) {
    const state = await getGameState();
    if (state.tickLockOwnerId) {
      await releaseLock(REDIS_LOCK_KEY, state.tickLockOwnerId);
      await mongoose.model('GameState').findOneAndUpdate({ key: 'global' }, { $set: { tickLockOwnerId: null } });
    }
    return;
  }

  // MongoDB fallback
  await mongoose
    .model('GameState')
    .findOneAndUpdate({ key: 'global', tickLock: ownerId }, { $set: { tickLock: null, tickLockedAt: null } });
}

export async function isMaintenanceMode() {
  const state = await getGameState();
  return state.maintenanceMode === true;
}

export async function getMaintenanceInfo() {
  const state = await getGameState();
  return {
    enabled: state.maintenanceMode === true,
    message: state.maintenanceMessage || '',
    enabledAt: state.maintenanceEnabledAt,
    enabledBy: state.maintenanceEnabledBy,
  };
}

export async function setMaintenanceMode(enabled, message, userId) {
  const update = {
    maintenanceMode: enabled,
    maintenanceMessage: enabled ? message || '' : '',
  };
  if (enabled) {
    update.maintenanceEnabledAt = new Date();
    update.maintenanceEnabledBy = userId;
  } else {
    update.maintenanceEnabledAt = null;
    update.maintenanceEnabledBy = null;
  }
  return mongoose.model('GameState').findOneAndUpdate({ key: 'global' }, { $set: update }, { new: true, upsert: true });
}

export default mongoose.model('GameState', gameStateSchema);
