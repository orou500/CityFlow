import UserVisit from '../models/UserVisit.js';
import { processPlayerProgress } from './playerProgress.js';

/**
 * Record an exploration/social visit and immediately re-evaluate the
 * player's missions so progress updates in real time. Never called for
 * unauthenticated requests; profile self-views are skipped by callers.
 */
export async function recordVisit(userId, targetType, targetId) {
  if (!userId) return;
  try {
    await UserVisit.create({ userId, targetType, targetId });
    await processPlayerProgress(userId, 'visit');
  } catch (err) {
    console.error(`[VISIT] Error recording ${targetType} visit:`, err.message);
  }
}
