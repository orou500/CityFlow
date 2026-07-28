import { updateMissionProgress } from '../engine/missionProcessing.js';
import { cacheDel } from './cache.js';
import { cacheKeys } from './cacheKeys.js';

export function triggerMissionProgress(userId, triggerType) {
  const userIdStr = userId?.toString?.() || userId;
  if (!userIdStr) return;

  updateMissionProgress(userId, triggerType).catch((err) => {
    console.error(`[MISSION_TRIGGER] Error updating progress for ${userIdStr}:`, err);
  });

  cacheDel(cacheKeys.missionDashboard(userIdStr)).catch((err) => {
    console.error(`[MISSION_TRIGGER] Error invalidating cache for ${userIdStr}:`, err.message);
  });
}

export async function triggerMissionProgressForMany(userIds, triggerType) {
  const unique = [...new Set(userIds.map((id) => id?.toString?.() || id).filter(Boolean))];
  for (const uid of unique) {
    triggerMissionProgress(uid, triggerType);
  }
}
