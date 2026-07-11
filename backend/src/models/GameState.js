import mongoose from 'mongoose';

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes — if lock is older than this, consider it stale

const gameStateSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  tickNumber: { type: Number, default: 0 },
  lastTickAt: { type: Date },
  tickLock: { type: String, default: null },
  tickLockedAt: { type: Date, default: null },
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
  const state = await getGameState();
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
  return state.tickNumber;
}

export async function acquireTickLock(ownerId) {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - LOCK_TTL_MS);

  // Atomically acquire: set lock only if it's null or stale
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
