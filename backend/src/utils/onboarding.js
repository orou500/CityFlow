import User from '../models/User.js';
import { ONBOARDING_UNLOCKS } from '../config/onboarding.js';
import { enqueueNotification } from '../utils/notificationQueue.js';

/**
 * Progressive onboarding helpers.
 *
 * Unlock rules:
 *  - A system is unlocked when user.level >= requiredLevel.
 *  - Pending = unlocked systems the player has not completed yet.
 *  - Migration: players who already progressed (old onboarding completed or
 *    level > 1) have all systems they already passed marked as completed so
 *    they never receive a backlog of tutorials.
 */

export function getPendingOnboarding(user) {
  const completed = new Set(user.completedOnboarding || []);
  return ONBOARDING_UNLOCKS.filter((u) => u.requiredLevel <= (user.level || 1) && !completed.has(u.id)).sort(
    (a, b) => a.requiredLevel - b.requiredLevel,
  );
}

/**
 * One-time migration for existing players. Returns true when a backfill was
 * performed. Fresh level-1 players who never completed the old onboarding
 * keep their Level-1 tutorial pending.
 */
export async function backfillOnboarding(user) {
  if (user.onboardingV2Seen) return false;

  const shouldBackfill = user.onboarding?.completed === true || (user.level || 1) > 1;
  if (shouldBackfill) {
    const toComplete = ONBOARDING_UNLOCKS.filter((u) => u.requiredLevel <= (user.level || 1)).map((u) => u.id);
    if (toComplete.length > 0) {
      await User.updateOne({ _id: user._id }, { $addToSet: { completedOnboarding: { $each: toComplete } } });
      user.completedOnboarding = [...new Set([...(user.completedOnboarding || []), ...toComplete])];
    }
  }

  await User.updateOne({ _id: user._id }, { $set: { onboardingV2Seen: true } });
  user.onboardingV2Seen = true;
  return shouldBackfill;
}

export async function completeOnboardingStep(userId, unlockId) {
  const unlock = ONBOARDING_UNLOCKS.find((u) => u.id === unlockId);
  if (!unlock) return null;

  const user = await User.findByIdAndUpdate(userId, { $addToSet: { completedOnboarding: unlockId } }, { new: true });
  return user;
}

/**
 * Called after a level-up. Announces newly unlocked systems via the existing
 * notification system (deduped by eventId, navigates to the feature via
 * `route`).
 */
export async function notifyOnboardingUnlocks(user) {
  try {
    if (!user || !user._id) return 0;
    const pending = getPendingOnboarding(user);
    if (pending.length === 0) return 0;

    let notified = 0;
    for (const unlock of pending) {
      await enqueueNotification({
        userId: user._id,
        type: 'system',
        title: unlock.notificationTitle || 'New Feature Unlocked',
        message: unlock.notificationMessage || `${unlock.titleKey} is now available!`,
        eventKey: `onboarding:${user._id}:${unlock.id}`,
        route: unlock.route,
        entityType: 'onboarding',
        entityId: user._id,
        global: false,
      });
      notified++;
    }
    return notified;
  } catch (err) {
    console.error('[ONBOARDING] notify error:', err.message);
    return 0;
  }
}
