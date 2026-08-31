import User from '../models/User.js';
import AdminAuditLog from '../models/AdminAuditLog.js';
import { validateUsername, normalizeUsername } from '../utils/username.js';
import {
  invalidateUser,
  invalidateUserProfile,
  invalidateCompany,
  invalidateLeaderboards,
} from '../utils/cacheInvalidation.js';
import { cacheDelPattern } from '../utils/cache.js';
import { cacheKeys } from '../utils/cacheKeys.js';
import { emitToUser, emitToCompany } from '../socket/index.js';
import { SOCKET_EVENTS } from '../socket/events.js';

const USERNAME_CHANGE_AUDIT_ACTION = 'user_username_changed';

/**
 * Atomically changes a user's username across the whole system.
 *
 * Concurrency safety: the claim is performed with a single
 * `findOneAndUpdate` that guards on the current `normalizedUsername` not
 * already equalling the requested one. The `normalizedUsername` DB unique
 * index is the final authority: if two replicas race for the same name, the
 * index rejects all but one and the winner sees a clean E11000 conflict
 * (mapped to a 409). No second uniqueness system is introduced.
 *
 * Does NOT rewrite any historical snapshot (auction bids/activity, season
 * archives, audit logs, notification bodies, stored event participants).
 * Current-state reads resolve `User.username` live, so only caches that can
 * hold CURRENT usernames are invalidated.
 */
export async function changeUsername(userId, newUsername) {
  const usernameError = validateUsername(newUsername);
  if (usernameError) {
    const err = new Error(usernameError);
    err.status = 400;
    throw err;
  }

  const user = await User.findById(userId);
  if (!user || user.deletedAt || user.banned) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const oldUsername = user.username;
  const oldNormalized = normalizeUsername(oldUsername);
  const requested = newUsername.trim();
  const newNormalized = normalizeUsername(requested);

  if (oldNormalized === newNormalized) {
    // Same username (different casing). Normalize consistently and succeed
    // without a uniqueness race — there is nothing different to claim.
    if (oldUsername === requested) {
      return { ok: true, changed: false, user: toSafeUser(user) };
    }
    user.username = requested;
    user.normalizedUsername = newNormalized;
    await user.save();
    await propagateChange(user, oldUsername);
    return { ok: true, changed: true, user: toSafeUser(user) };
  }

  // Atomic claim. The unique index on normalizedUsername is the arbiter.
  let updated;
  try {
    updated = await User.findOneAndUpdate(
      { _id: user._id, normalizedUsername: { $ne: newNormalized } },
      { $set: { username: requested, normalizedUsername: newNormalized } },
      { new: true },
    );
  } catch (err) {
    if (err && err.code === 11000) {
      const conflict = new Error('Username already taken');
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  }

  if (!updated) {
    const err = new Error('Username already taken');
    err.status = 409;
    throw err;
  }

  try {
    await propagateChange(updated, oldUsername);
  } catch (err) {
    // Cache invalidation / socket emit must never fail the username change.
    console.error('[USERNAME] post-change propagation failed:', err.message);
  }

  return { ok: true, changed: true, user: toSafeUser(updated) };
}

async function propagateChange(user, oldUsername) {
  const userId = user._id;

  // Invalidate caches that can hold CURRENT username data.
  await Promise.all([
    invalidateUser(userId),
    invalidateUserProfile(oldUsername),
    invalidateUserProfile(user.username),
    invalidateLeaderboards(),
    cacheDelPattern('cf:auction*'),
    cacheDelPattern(cacheKeys.competitiveEvents('*')),
    cacheDelPattern('cf:events:comp:*'),
  ]);
  if (user.companyId) {
    await invalidateCompany(user.companyId);
  }

  // Realtime broadcast — carried to other replicas by the Redis socket
  // adapter; nothing depends on process-local state.
  const payload = {
    userId: userId.toString(),
    username: user.username,
    displayName: user.displayName || '',
  };
  emitToUser(userId, SOCKET_EVENTS.USER_UPDATED, payload);
  if (user.companyId) {
    emitToCompany(user.companyId, SOCKET_EVENTS.USER_UPDATED, payload);
  }

  // Audit trail (immutable historical record, includes only old->new mapping).
  try {
    await AdminAuditLog.create({
      adminId: userId,
      adminUsername: user.username,
      action: USERNAME_CHANGE_AUDIT_ACTION,
      targetUserId: userId,
      targetUsername: user.username,
      details: { from: oldUsername, to: user.username },
    });
  } catch (err) {
    console.error('[USERNAME] audit log failed:', err.message);
  }
}

function toSafeUser(user) {
  const obj = user.toJSON();
  return {
    _id: obj._id,
    username: obj.username,
    displayName: obj.displayName,
    avatar: obj.avatar,
    email: obj.email,
    preferredLanguage: obj.preferredLanguage,
    theme: obj.theme,
    level: obj.level,
    role: obj.role,
  };
}

// Re-export helpers for callers/tests.
export { validateUsername };
export default { changeUsername, validateUsername };
