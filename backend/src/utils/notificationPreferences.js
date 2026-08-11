import User from '../models/User.js';
import { cacheGetOrSet, cacheDel } from './cache.js';
import { cacheKeys, cacheTTL } from './cacheKeys.js';
import { DEFAULT_PREFERENCES, CATEGORY_TO_PREFERENCE, PRIORITY } from '../config/notificationConfig.js';

/**
 * Per-user notification category preferences. Missing keys default to
 * enabled; critical/security notifications bypass preferences entirely.
 * Cached for a few minutes so notification fan-outs don't query the user
 * doc for every single notification.
 */
export async function getUserNotificationPreferences(userId) {
  const userIdStr = userId?.toString?.() || userId;
  if (!userIdStr) return { ...DEFAULT_PREFERENCES };

  const cached = await cacheGetOrSet(
    cacheKeys.notificationPrefs(userIdStr),
    async () => {
      const user = await User.findById(userIdStr).select('notificationPreferences').lean();
      const stored = user?.notificationPreferences || {};
      return { ...DEFAULT_PREFERENCES, ...stored };
    },
    cacheTTL.medium,
  );
  return cached || { ...DEFAULT_PREFERENCES };
}

export async function updateUserNotificationPreferences(userId, prefs = {}) {
  const userIdStr = userId?.toString?.() || userId;
  if (!userIdStr) return null;

  const stored = await User.findById(userIdStr).select('notificationPreferences').lean();
  const current = { ...DEFAULT_PREFERENCES, ...(stored?.notificationPreferences || {}) };

  const updates = {};
  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    if (typeof prefs[key] === 'boolean') updates[key] = prefs[key];
  }

  await User.updateOne({ _id: userIdStr }, { $set: { notificationPreferences: { ...current, ...updates } } });
  await cacheDel(cacheKeys.notificationPrefs(userIdStr));
  return { ...current, ...updates };
}

/**
 * Whether a notification for this user should be delivered at all.
 * Critical notifications always pass; non-critical ones are gated by the
 * user's category preference.
 */
export async function isNotificationAllowed(userId, priority, category) {
  if (priority === PRIORITY.CRITICAL) return true;
  const prefs = await getUserNotificationPreferences(userId);
  const prefKey = CATEGORY_TO_PREFERENCE[category];
  if (!prefKey) return true;
  return prefs[prefKey] !== false;
}
